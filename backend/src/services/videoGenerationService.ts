import type { ProviderRegistry, VideoProviderResult } from '../providers';
import { pollVideoProvider, submitVideoProvider } from '../providers';
import type { Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { TaskService, type TaskReporter } from './taskService';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveError, MediaArchiveService } from './mediaArchiveService';
import { ProviderError } from '../providers/errors';

export interface VideoGenerationInput {
  dramaId: number;
  prompt: string;
  model?: string;
  provider?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  storyboardId?: number | null;
  image?: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages: string[];
}

export interface VideoGenerationRow {
  id: number;
  drama_id: number;
  episode_id: number | null;
  storyboard_id: number | null;
  provider: string | null;
  prompt: string;
  model: string | null;
  duration: number | null;
  aspect_ratio: string | null;
  resolution: string | null;
  image_url: string | null;
  first_frame_url: string | null;
  last_frame_url: string | null;
  reference_image_urls: string;
  video_url: string | null;
  source_url: string | null;
  local_path: string | null;
  media_type: string | null;
  file_size: number | null;
  failure_stage: string | null;
  status: string;
  task_id: string | null;
  provider_task_id: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  available: boolean;
}

export class VideoGenerationService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly mediaReferences: MediaReferenceService,
    private readonly mediaArchive: MediaArchiveService,
    private readonly configs: AiConfigService,
    private readonly tasks: TaskService,
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
  ) {}

  list(dramaId?: number): VideoGenerationRow[] {
    const rows = dramaId
      ? this.db.prepare('SELECT * FROM video_generations WHERE drama_id = ? ORDER BY id DESC').all(dramaId) as VideoGenerationRow[]
      : this.db.prepare('SELECT * FROM video_generations ORDER BY id DESC').all() as VideoGenerationRow[];
    return rows.map((row) => this.present(row));
  }

  get(id: number): VideoGenerationRow | undefined {
    const row = this.db.prepare('SELECT * FROM video_generations WHERE id = ?').get(id) as VideoGenerationRow | undefined;
    return row ? this.present(row) : undefined;
  }

  select(id: number): VideoGenerationRow {
    const row = this.get(id);
    if (!row) throw new ValidationError('视频生成记录不存在');
    if (row.status !== 'completed' || !row.video_url || !row.local_path || !row.available) throw new ValidationError('只能选用本地文件真实存在的已完成视频');
    const now = new Date().toISOString();
    if (row.storyboard_id) {
      this.db.prepare('UPDATE storyboards SET video_url = ?, current_video_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.video_url, row.id, now, row.storyboard_id);
    } else if (row.episode_id) {
      this.db.prepare('UPDATE episodes SET video_url = ?, current_video_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.video_url, row.id, now, row.episode_id);
    } else {
      throw new ValidationError('这条通用视频历史没有可切换的分镜或剧集');
    }
    return row;
  }

  create(input: VideoGenerationInput): VideoGenerationRow {
    if (input.storyboardId) {
      const activeVideo = this.db.prepare("SELECT id FROM video_generations WHERE storyboard_id = ? AND status IN ('pending', 'processing') LIMIT 1")
        .get(input.storyboardId) as { id: number } | undefined;
      const activeImage = this.db.prepare("SELECT id FROM image_generations WHERE storyboard_id = ? AND status IN ('pending', 'processing') LIMIT 1")
        .get(input.storyboardId) as { id: number } | undefined;
      if (activeVideo || activeImage) throw new ConflictError('分镜已有进行中的生成任务，请等待完成或先取消');
    }
    const references = unique([input.image, input.firstFrame, input.lastFrame, ...input.referenceImages]);
    const mode = references.length ? 'image-to-video' : 'text-to-video';
    const aiConfig = this.configs.select('video', input.provider, input.model, {
      mode,
      referenceImageCount: references.length,
      aspectRatio: input.aspectRatio,
      requiresAspectRatio: true,
    });
    const model = input.model || aiConfig.default_model || aiConfig.model[0];
    if (!model) throw new ValidationError('视频配置没有可用模型');
    const modelSnapshot = this.configs.models(aiConfig.provider, 'video').find((entry) => entry.id === model);
    const declaredDurations = modelSnapshot?.capabilities.supportedDurations;
    const duration = resolveVideoDuration(input.duration, declaredDurations, modelSnapshot?.capabilities.supportsDuration === true);
    const aspectRatio = this.configs.resolveAspectRatio('video', aiConfig.provider, model, input.aspectRatio);
    const adapter = this.registry.require({ kind: 'video', config: aiConfig, model });
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO video_generations (
        drama_id, storyboard_id, provider, prompt, model, duration, aspect_ratio, resolution,
        image_url, first_frame_url, last_frame_url, reference_image_urls, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      input.dramaId,
      input.storyboardId ?? null,
      aiConfig.provider,
      input.prompt,
      model,
      duration ?? null,
      aspectRatio,
      input.resolution ?? null,
      input.image ?? null,
      input.firstFrame ?? null,
      input.lastFrame ?? null,
      JSON.stringify(input.referenceImages),
      now,
      now,
    );
    const id = Number(result.lastInsertRowid);
    this.log.audit?.('video.generation.created', {
      generationId: id,
      projectId: input.dramaId,
      storyboardId: input.storyboardId,
      provider: aiConfig.provider,
      model,
      mode,
      aspectRatio,
      duration,
      referenceCount: references.length,
      prompt: input.prompt,
    });
    const taskId = this.tasks.run('video_generation', String(id), async (reporter) =>
      this.execute(id, { ...input, duration, aspectRatio }, model, aiConfig, adapter, reporter));
    this.db.prepare('UPDATE video_generations SET task_id = ?, updated_at = ? WHERE id = ?').run(taskId, new Date().toISOString(), id);
    return this.get(id) as VideoGenerationRow;
  }

  resume(id: number): VideoGenerationRow {
    const row = this.get(id);
    if (!row) throw new NotFoundError('视频生成记录不存在');
    if (!row.provider_task_id || !row.model || !row.provider) throw new ValidationError('视频记录没有可恢复的供应商任务');
    const config = this.configs.select('video', row.provider, row.model);
    const adapter = this.registry.require({ kind: 'video', config, model: row.model });
    const taskId = this.tasks.run('video_generation', String(id), async (reporter) => {
      try {
        const result = await this.pollUntilDone(id, adapter, config, row.provider_task_id as string, row.model as string, reporter);
        reporter.throwIfCancelled();
        return await this.saveCompleted(id, result.videoUrl as string, row.drama_id, row.storyboard_id, reporter);
      } catch (error) {
        if (reporter.signal.aborted) this.mark(id, 'cancelled');
        else this.fail(id, error, error instanceof MediaArchiveError ? 'archive' : 'provider');
        throw error;
      }
    });
    this.db.prepare(`UPDATE video_generations SET task_id = ?, status = 'processing', error_msg = NULL, updated_at = ? WHERE id = ?`)
      .run(taskId, new Date().toISOString(), id);
    return this.get(id) as VideoGenerationRow;
  }

  private async execute(
    id: number,
    input: VideoGenerationInput,
    model: string,
    config: ReturnType<AiConfigService['select']>,
    adapter: ReturnType<ProviderRegistry['require']>,
    reporter: TaskReporter,
  ): Promise<Record<string, unknown>> {
    this.mark(id, 'processing');
    reporter.stage('正在提交视频生成');
    try {
      this.log.audit?.('video.provider.started', { generationId: id, provider: config.provider, model });
      let result = await submitVideoProvider(adapter, {
        config,
        log: this.log,
        db: this.db,
        resolveMediaReference: this.mediaReferences.resolve,
      }, {
        prompt: input.prompt,
        model,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        image: input.image,
        firstFrame: input.firstFrame,
        lastFrame: input.lastFrame,
        referenceImages: input.referenceImages,
        signal: reporter.signal,
      });
      this.log.audit?.('video.provider.submitted', { generationId: id, provider: config.provider, model, result });
      if (result.taskId) {
        this.db.prepare('UPDATE video_generations SET provider_task_id = ?, updated_at = ? WHERE id = ?')
          .run(result.taskId, new Date().toISOString(), id);
      }
      if (result.status !== 'completed') {
        if (!result.taskId) throw new Error('视频供应商没有返回任务 ID');
        result = await this.pollUntilDone(id, adapter, config, result.taskId, model, reporter);
      }
      reporter.throwIfCancelled();
      if (!result.videoUrl) throw new Error(result.error || '视频供应商没有返回视频地址');
      this.log.audit?.('video.provider.completed', { generationId: id, provider: config.provider, model, result });
      return await this.saveCompleted(id, result.videoUrl, input.dramaId, input.storyboardId ?? null, reporter);
    } catch (error) {
      if (reporter.signal.aborted) this.mark(id, 'cancelled');
      else this.fail(id, error, error instanceof MediaArchiveError ? 'archive' : 'provider');
      this.log.audit?.('video.generation.failed', {
        generationId: id,
        projectId: input.dramaId,
        storyboardId: input.storyboardId,
        stage: error instanceof MediaArchiveError ? 'archive' : 'provider',
        error,
      });
      throw error;
    }
  }

  private async pollUntilDone(
    id: number,
    adapter: ReturnType<ProviderRegistry['require']>,
    config: ReturnType<AiConfigService['select']>,
    taskId: string,
    model: string,
    reporter: TaskReporter,
  ): Promise<VideoProviderResult> {
    for (let attempt = 0; ; attempt += 1) {
      reporter.throwIfCancelled();
      if (attempt > 0) await wait(5_000, reporter.signal);
      let result: VideoProviderResult;
      try {
        result = await pollVideoProvider(adapter, { config, log: this.log, db: this.db }, taskId, reporter.signal, model);
      } catch (error) {
        reporter.throwIfCancelled();
        if (error instanceof ProviderError && error.retryable) {
          this.log.audit?.('provider.video.poll.retry', {
            provider: adapter.descriptor.id,
            taskId,
            attempt: attempt + 1,
            code: error.code,
            message: error.message,
          });
          reporter.stage('供应商状态查询暂时失败，正在继续等待');
          this.mark(id, 'processing');
          continue;
        }
        throw error;
      }
      if (typeof result.progress === 'number') reporter.progress(result.progress, '正在生成视频');
      else reporter.stage('正在生成视频');
      if (result.status === 'completed') return result;
      if (result.status === 'failed') throw new Error(result.error || '视频生成失败');
      this.mark(id, 'processing');
    }
  }

  private async saveCompleted(
    id: number,
    sourceUrl: string,
    projectId: number,
    storyboardId: number | null,
    reporter: TaskReporter,
  ): Promise<Record<string, unknown>> {
    reporter.stage('供应商生成完成，正在保存视频到本地');
    const archived = await this.mediaArchive.archiveRemote({
      projectId,
      generationId: id,
      kind: 'video',
      sourceUrl,
      signal: reporter.signal,
    });
    try {
      reporter.throwIfCancelled();
      const now = new Date().toISOString();
      const commit = this.db.transaction(() => {
        this.db.prepare(`
          UPDATE video_generations SET status = 'completed', video_url = ?, source_url = ?, local_path = ?, media_type = ?,
            file_size = ?, failure_stage = NULL, error_msg = NULL, updated_at = ?, completed_at = ? WHERE id = ?
        `).run(archived.publicUrl, sourceUrl, archived.relativePath, archived.mediaType, archived.fileSize, now, now, id);
        if (storyboardId) this.db.prepare('UPDATE storyboards SET video_url = ?, current_video_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, id, now, storyboardId);
      });
      commit();
      this.log.audit?.('video.generation.completed', {
        generationId: id,
        projectId,
        storyboardId,
        archived,
      });
      return { video_url: archived.publicUrl, source_url: sourceUrl, local_path: archived.relativePath, generation_id: id };
    } catch (error) {
      await this.mediaArchive.remove(archived.relativePath).catch(() => undefined);
      if (reporter.signal.aborted) throw error;
      throw new MediaArchiveError('本地归档失败：无法提交生成记录和当前 generation 指针', { cause: error });
    }
  }

  private mark(id: number, status: string): void {
    this.db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  }

  private fail(id: number, error: unknown, stage: 'provider' | 'archive'): void {
    const message = error instanceof Error ? error.message : String(error);
    this.db.prepare(`UPDATE video_generations SET status = 'failed', failure_stage = ?, error_msg = ?, updated_at = ? WHERE id = ?`)
      .run(stage, message, new Date().toISOString(), id);
  }

  private present(row: VideoGenerationRow): VideoGenerationRow {
    return { ...row, available: row.status === 'completed' && this.mediaArchive.isAvailable(row.local_path) };
  }

}

export function videoReferences(row: VideoGenerationRow): string[] {
  return parseJson<string[]>(row.reference_image_urls, []);
}

function resolveVideoDuration(
  requested: number | undefined,
  declaredDurations: number[] | null | undefined,
  supportsDuration: boolean,
): number | undefined {
  if (declaredDurations?.length) {
    if (requested === undefined) return declaredDurations[0];
    if (!declaredDurations.includes(requested)) {
      throw new ValidationError(`当前模型不支持该时长，可选：${declaredDurations.join('、')} 秒`);
    }
    return requested;
  }
  if (!supportsDuration) return undefined;
  return requested;
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason ?? new Error('任务已取消');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new Error('任务已取消'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}
