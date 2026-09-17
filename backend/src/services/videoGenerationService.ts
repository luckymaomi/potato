import type { ProviderRegistry, VideoProviderResult } from '../providers';
import { pollVideoProvider, submitVideoProvider } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { TaskService, type TaskReporter } from './taskService';
import { NotFoundError, ValidationError } from '../errors';

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
  local_path: string | null;
  status: string;
  task_id: string | null;
  provider_task_id: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export class VideoGenerationService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly appConfig: AppConfig,
    private readonly configs: AiConfigService,
    private readonly tasks: TaskService,
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
  ) {}

  list(dramaId?: number): VideoGenerationRow[] {
    return dramaId
      ? this.db.prepare('SELECT * FROM video_generations WHERE drama_id = ? ORDER BY id DESC').all(dramaId) as VideoGenerationRow[]
      : this.db.prepare('SELECT * FROM video_generations ORDER BY id DESC').all() as VideoGenerationRow[];
  }

  get(id: number): VideoGenerationRow | undefined {
    return this.db.prepare('SELECT * FROM video_generations WHERE id = ?').get(id) as VideoGenerationRow | undefined;
  }

  create(input: VideoGenerationInput): VideoGenerationRow {
    const aiConfig = this.configs.select('video', input.provider, input.model);
    const model = input.model || aiConfig.default_model || aiConfig.model[0];
    if (!model) throw new ValidationError('视频配置没有可用模型');
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
      input.duration ?? null,
      input.aspectRatio ?? null,
      input.resolution ?? null,
      input.image ?? null,
      input.firstFrame ?? null,
      input.lastFrame ?? null,
      JSON.stringify(input.referenceImages),
      now,
      now,
    );
    const id = Number(result.lastInsertRowid);
    const taskId = this.tasks.run('video_generation', String(id), async (reporter) =>
      this.execute(id, input, model, aiConfig, adapter, reporter));
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
        return this.saveCompleted(id, result.videoUrl as string, row.storyboard_id);
      } catch (error) {
        this.fail(id, error);
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
    reporter.progress(5, '正在提交视频生成');
    try {
      let result = await submitVideoProvider(adapter, {
        config,
        log: this.log,
        db: this.db,
        resolveMediaReference: async (source) => this.publicReference(source),
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
      });
      if (result.taskId) {
        this.db.prepare('UPDATE video_generations SET provider_task_id = ?, updated_at = ? WHERE id = ?')
          .run(result.taskId, new Date().toISOString(), id);
      }
      if (result.status !== 'completed') {
        if (!result.taskId) throw new Error('视频供应商没有返回任务 ID');
        result = await this.pollUntilDone(id, adapter, config, result.taskId, model, reporter);
      }
      if (!result.videoUrl) throw new Error(result.error || '视频供应商没有返回视频地址');
      return this.saveCompleted(id, result.videoUrl, input.storyboardId ?? null);
    } catch (error) {
      this.fail(id, error);
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
    const timeoutMinutes = this.appConfig.video?.generation_timeout_minutes ?? 30;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMinutes * 12));
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await wait(5_000);
      const result = await pollVideoProvider(adapter, { config, log: this.log, db: this.db }, taskId, undefined, model);
      reporter.progress(Math.min(95, result.progress ?? 10 + Math.round((attempt / maxAttempts) * 80)), '正在生成视频');
      if (result.status === 'completed') return result;
      if (result.status === 'failed') throw new Error(result.error || '视频生成失败');
      this.mark(id, 'processing');
    }
    throw new Error(`视频生成超过 ${timeoutMinutes} 分钟，已停止轮询`);
  }

  private saveCompleted(id: number, videoUrl: string, storyboardId: number | null): Record<string, unknown> {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE video_generations SET status = 'completed', video_url = ?, error_msg = NULL, updated_at = ?, completed_at = ? WHERE id = ?
    `).run(videoUrl, now, now, id);
    if (storyboardId) this.db.prepare('UPDATE storyboards SET video_url = ?, updated_at = ? WHERE id = ?').run(videoUrl, now, storyboardId);
    return { video_url: videoUrl, generation_id: id };
  }

  private mark(id: number, status: string): void {
    this.db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  }

  private fail(id: number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.db.prepare(`UPDATE video_generations SET status = 'failed', error_msg = ?, updated_at = ? WHERE id = ?`)
      .run(message, new Date().toISOString(), id);
  }

  private publicReference(source: string): string | undefined {
    if (/^https?:\/\//iu.test(source) || /^data:/iu.test(source)) return source;
    if (!source.startsWith('/static/')) return undefined;
    const base = this.appConfig.storage?.base_url?.replace(/\/+$/u, '') ?? 'http://localhost:5679/static';
    return `${base}/${source.slice('/static/'.length)}`;
  }
}

export function videoReferences(row: VideoGenerationRow): string[] {
  return parseJson<string[]>(row.reference_image_urls, []);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
