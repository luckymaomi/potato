import { NotFoundError, ValidationError } from '../errors';
import type {
  ProductionCommand,
  ProductionSubmission,
  ProductionTarget,
} from '../production/commands';
import type { Logger, SQLiteDatabase } from '../types/core';
import { asRecord } from '../types/core';
import type { EntityKind, EpisodeRow } from '../types/domain';
import { CompositionService } from './compositionService';
import { AssetRepository } from './assetRepository';
import { ImageGenerationService, type ImageGenerationInput } from './imageGenerationService';
import { ProjectService } from './projectService';
import { TaskService } from './taskService';
import { listTextPrompts, resolveSystemPrompt, type TextPromptKey } from './textPromptCatalog';
import { TextGenerationService } from './textGenerationService';
import { VideoGenerationService } from './videoGenerationService';

export class ProductionWorkflowService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly projects: ProjectService,
    private readonly assets: AssetRepository,
    private readonly text: TextGenerationService,
    private readonly images: ImageGenerationService,
    private readonly videos: VideoGenerationService,
    private readonly composition: CompositionService,
    private readonly tasks: TaskService,
    private readonly log?: Logger,
  ) {}

  textPrompts() {
    return listTextPrompts();
  }

  execute(command: ProductionCommand): ProductionSubmission {
    this.log?.audit?.('production.command.submitted', {
      kind: command.kind,
      projectId: command.projectId,
      audit: command.audit,
      command,
    });
    this.projects.require(command.projectId);
    const submission = command.kind === 'manual-text'
      ? this.runManualText(command)
      : command.kind === 'ai-text'
        ? pending(this.runAiText(command))
        : command.kind === 'image'
          ? pending(this.runImage(command))
          : command.kind === 'video'
            ? pending(this.runVideo(command))
            : pending(this.runFinalize(command));
    this.log?.audit?.('production.command.accepted', {
      kind: command.kind,
      projectId: command.projectId,
      audit: command.audit,
      submission,
    });
    return submission;
  }

  private runManualText(command: Extract<ProductionCommand, { kind: 'manual-text' }>): ProductionSubmission {
    if (!command.persistAsScript) return { status: 'completed', result: { text: command.text } };
    if (!command.episodeId) throw new ValidationError('手动剧本需要关联集数');
    const episode = this.requireEpisode(command.projectId, command.episodeId);
    this.db.prepare('UPDATE episodes SET script_content = ?, updated_at = ? WHERE id = ?')
      .run(command.text, new Date().toISOString(), episode.id);
    return { status: 'completed', result: { text: command.text, episode_id: episode.id } };
  }

  private runAiText(command: Extract<ProductionCommand, { kind: 'ai-text' }>): string {
    const episode = command.episodeId ? this.requireEpisode(command.projectId, command.episodeId) : undefined;
    return this.tasks.run(`production_${command.action}`, episode ? String(episode.id) : String(command.projectId), async (reporter) => {
      reporter.stage(textProgress(command.action));
      const project = this.projects.require(command.projectId);
      const prompt = command.action === 'write-script'
        ? `项目：${project.title}\n类型：${project.genre ?? '未指定'}\n创作要求：${command.sourceText}`
        : command.sourceText;
      const generated = await this.text.generate({
        prompt,
        system: resolveSystemPrompt(command.action, command.systemPrompt, { storyboardCount: command.storyboardCount }),
        provider: command.provider,
        model: command.model,
        json: extractionAction(command.action),
        maxTokens: command.action === 'split-storyboards' ? 12_000 : command.action === 'write-script' ? 8_000 : undefined,
        signal: reporter.signal,
      });
      reporter.throwIfCancelled();
      const result = this.persistTextResult(command, episode, generated);
      return result;
    });
  }

  private persistTextResult(
    command: Extract<ProductionCommand, { kind: 'ai-text' }>,
    episode: EpisodeRow | undefined,
    generated: string,
  ): Record<string, unknown> {
    if (command.action === 'generate-text') return { text: generated };
    if (command.action === 'write-script') {
      if (episode) this.db.prepare('UPDATE episodes SET script_content = ?, updated_at = ? WHERE id = ?')
        .run(generated, new Date().toISOString(), episode.id);
      return { text: generated, episode_id: episode?.id ?? null };
    }
    const items = parseItems(generated);
    if (command.action === 'extract-characters') return { characters: this.assets.syncCharacters(command.projectId, items) };
    if (command.action === 'extract-scenes') return { scenes: this.assets.syncScenes(command.projectId, items) };
    if (command.action === 'extract-props') return { props: this.assets.syncProps(command.projectId, items) };
    const selected = command.storyboardCount ? items.slice(0, command.storyboardCount) : items;
    return { storyboards: episode ? this.assets.syncStoryboards(episode.id, selected) : selected };
  }

  private runImage(command: Extract<ProductionCommand, { kind: 'image' }>): string {
    const prompt = command.prompt.trim();
    if (!prompt) throw new ValidationError('图片提示词不能为空');
    const referenceImages = command.mode === 'image-to-image' ? unique(command.referenceImages) : [];
    if (command.mode === 'image-to-image' && referenceImages.length === 0) throw new ValidationError('图生图至少需要一张显式参考图');
    const image = this.images.create({
      dramaId: command.projectId,
      prompt,
      provider: command.provider,
      model: command.model,
      aspectRatio: command.aspectRatio,
      referenceImages,
      ...this.validateImageTarget(command.projectId, command.target),
    });
    if (!image.task_id) throw new Error('图片服务没有返回任务 ID');
    return image.task_id;
  }

  private runVideo(command: Extract<ProductionCommand, { kind: 'video' }>): string {
    const prompt = command.prompt.trim();
    if (!prompt) throw new ValidationError('视频提示词不能为空');
    const referenceImages = command.mode === 'image-to-video' ? unique(command.referenceImages) : [];
    if (command.mode === 'image-to-video' && referenceImages.length === 0) throw new ValidationError('图生视频至少需要一张显式参考图');
    const video = this.videos.create({
      dramaId: command.projectId,
      prompt,
      provider: command.provider,
      model: command.model,
      duration: command.duration,
      aspectRatio: command.aspectRatio,
      storyboardId: command.storyboardId ?? null,
      image: referenceImages[0],
      firstFrame: referenceImages[0],
      referenceImages,
    });
    if (!video.task_id) throw new Error('视频服务没有返回任务 ID');
    return video.task_id;
  }

  private runFinalize(command: Extract<ProductionCommand, { kind: 'finalize' }>): string {
    this.requireEpisode(command.projectId, command.episodeId);
    return this.composition.finalize(command.episodeId, command.videoUrls);
  }

  private validateImageTarget(
    projectId: number,
    target: ProductionTarget | undefined,
  ): Partial<Pick<ImageGenerationInput, 'storyboardId' | 'characterId' | 'sceneId' | 'propId'>> {
    if (!target) return {};
    if (target.kind === 'storyboard') {
      this.requireStoryboard(projectId, target.id);
      return { storyboardId: target.id };
    }
    const record = target.kind === 'character'
      ? this.assets.getCharacter(target.id)
      : target.kind === 'scene'
        ? this.assets.getScene(target.id)
        : this.assets.getProp(target.id);
    if (!record || record.drama_id !== projectId) throw new NotFoundError(`${entityLabel(target.kind)}不存在于当前项目`);
    if (target.kind === 'character') return { characterId: target.id };
    if (target.kind === 'scene') return { sceneId: target.id };
    return { propId: target.id };
  }

  private requireEpisode(projectId: number, episodeId: number): EpisodeRow {
    const episode = this.assets.episode(episodeId);
    if (!episode || episode.drama_id !== projectId) throw new NotFoundError('集数不存在于当前项目');
    return episode;
  }

  private requireStoryboard(projectId: number, storyboardId: number): void {
    const storyboard = this.assets.getStoryboard(storyboardId);
    if (!storyboard) throw new NotFoundError('分镜不存在');
    this.requireEpisode(projectId, storyboard.episode_id);
  }
}

function pending(taskId: string): ProductionSubmission {
  return { status: 'pending', task_id: taskId };
}

function extractionAction(action: TextPromptKey): boolean {
  return action === 'extract-characters' || action === 'extract-scenes' || action === 'extract-props' || action === 'split-storyboards';
}

function textProgress(action: TextPromptKey): string {
  return {
    'generate-text': '正在生成文本',
    'write-script': '正在生成剧本',
    'extract-characters': '正在提取角色',
    'extract-scenes': '正在提取场景',
    'extract-props': '正在提取道具',
    'split-storyboards': '正在拆分分镜',
  }[action];
}

function parseItems(text: string): unknown[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned) as unknown; } catch { throw new Error('AI 返回的 JSON 无法解析，请重试'); }
  if (Array.isArray(parsed)) return parsed;
  const items = asRecord(parsed)?.items;
  if (!Array.isArray(items)) throw new Error('AI 返回结果缺少 items 数组');
  return items;
}

function entityLabel(kind: EntityKind): string {
  return { character: '角色', scene: '场景', prop: '道具' }[kind];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
