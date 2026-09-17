import type { SQLiteDatabase } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import { EntityService } from './entityService';
import { ProjectService } from './projectService';
import { StoryboardService } from './storyboardService';
import { TaskService } from './taskService';
import { TextGenerationService } from './textGenerationService';
import { NotFoundError, ValidationError } from '../errors';

export class WorkbenchGenerationService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly projects: ProjectService,
    private readonly entities: EntityService,
    private readonly storyboards: StoryboardService,
    private readonly text: TextGenerationService,
    private readonly tasks: TaskService,
  ) {}

  generateStory(input: unknown): string {
    const body = asRecord(input) ?? {};
    const dramaId = requiredId(body.drama_id, '项目');
    const project = this.projects.require(dramaId);
    const episodeId = readNumber(body.episode_id);
    const outline = readString(body.outline) ?? readString(body.prompt) ?? project.description ?? project.title;
    return this.tasks.run('text_story', episodeId ? String(episodeId) : String(dramaId), async (reporter) => {
      reporter.progress(10, '正在生成剧本');
      const script = await this.text.generate({
        prompt: `项目：${project.title}\n类型：${project.genre ?? '未指定'}\n创作要求：${outline}`,
        system: '你是短剧编剧。输出可直接拍摄的中文短剧剧本，包含场次、人物动作和对白，不要解释创作过程。',
        model: readString(body.model),
        provider: readString(body.provider),
        maxTokens: 8_000,
      });
      if (episodeId) {
        const episode = this.storyboards.episode(episodeId);
        if (!episode || episode.drama_id !== dramaId) throw new NotFoundError('项目中的集数不存在');
        this.db.prepare('UPDATE episodes SET script_content = ?, updated_at = ? WHERE id = ?')
          .run(script, new Date().toISOString(), episodeId);
      }
      reporter.progress(100, '剧本生成完成');
      return { text: script, episode_id: episodeId ?? null };
    });
  }

  extractCharacters(episodeId: number, input: unknown = {}): string {
    const episode = this.requireEpisode(episodeId);
    const body = asRecord(input) ?? {};
    return this.tasks.run('extract_characters', String(episodeId), async (reporter) => {
      reporter.progress(10, '正在提取角色');
      const text = await this.text.generate({
        prompt: episode.script_content || '',
        system: '从剧本提取主要角色。只输出 JSON：{"items":[{"name":"角色名","description":"身份与性格","appearance":"稳定的外观提示词"}]}。',
        model: readString(body.model),
        provider: readString(body.provider),
        json: true,
      });
      const items = parseItems(text);
      const characters = this.entities.replaceCharacters(episode.drama_id, items);
      reporter.progress(100, '角色提取完成');
      return { characters };
    });
  }

  extractScenes(episodeId: number, input: unknown = {}): string {
    const episode = this.requireEpisode(episodeId);
    const body = asRecord(input) ?? {};
    return this.tasks.run('extract_scenes', String(episodeId), async (reporter) => {
      reporter.progress(10, '正在提取场景');
      const text = await this.text.generate({
        prompt: episode.script_content || '',
        system: '从剧本提取拍摄场景。只输出 JSON：{"items":[{"location":"场景名","prompt":"环境、时间、光线、构图提示词"}]}。',
        model: readString(body.model),
        provider: readString(body.provider),
        json: true,
      });
      const scenes = this.entities.replaceScenes(episode.drama_id, episodeId, parseItems(text));
      reporter.progress(100, '场景提取完成');
      return { scenes };
    });
  }

  extractProps(episodeId: number, input: unknown = {}): string {
    const episode = this.requireEpisode(episodeId);
    const body = asRecord(input) ?? {};
    return this.tasks.run('extract_props', String(episodeId), async (reporter) => {
      reporter.progress(10, '正在提取道具');
      const text = await this.text.generate({
        prompt: episode.script_content || '',
        system: '从剧本提取影响剧情或需要保持一致的道具。只输出 JSON：{"items":[{"name":"道具名","description":"剧情用途","prompt":"外观生成提示词"}]}。',
        model: readString(body.model),
        provider: readString(body.provider),
        json: true,
      });
      const props = this.entities.replaceProps(episode.drama_id, episodeId, parseItems(text));
      reporter.progress(100, '道具提取完成');
      return { props };
    });
  }

  generateStoryboards(episodeId: number, input: unknown = {}): string {
    const episode = this.requireEpisode(episodeId);
    const body = asRecord(input) ?? {};
    return this.tasks.run('generate_storyboards', String(episodeId), async (reporter) => {
      reporter.progress(10, '正在拆分分镜');
      const text = await this.text.generate({
        prompt: episode.script_content || '',
        system: '把剧本拆成连续可拍摄分镜。只输出 JSON：{"items":[{"title":"镜头标题","description":"画面内容","action":"动作","dialogue":"对白","image_prompt":"静态画面提示词","video_prompt":"运动与镜头提示词","duration":5}]}。',
        model: readString(body.model),
        provider: readString(body.provider),
        json: true,
        maxTokens: 12_000,
      });
      const storyboards = this.storyboards.replace(episodeId, parseItems(text));
      reporter.progress(100, '分镜生成完成');
      return { storyboards };
    });
  }

  private requireEpisode(id: number): NonNullable<ReturnType<StoryboardService['episode']>> {
    const episode = this.storyboards.episode(id);
    if (!episode) throw new NotFoundError('集数不存在');
    if (!episode.script_content?.trim()) throw new ValidationError('请先填写或生成剧本');
    return episode;
  }
}

function parseItems(text: string): unknown[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned) as unknown; } catch { throw new Error('AI 返回的 JSON 无法解析，请重试'); }
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  const items = record?.items;
  if (!Array.isArray(items)) throw new Error('AI 返回结果缺少 items 数组');
  return items;
}

function requiredId(value: unknown, label: string): number {
  const id = readNumber(value);
  if (!id || id < 1) throw new ValidationError(`${label} ID 无效`);
  return id;
}
