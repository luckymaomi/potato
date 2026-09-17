import type { ProviderRegistry } from '../providers';
import { runImageProvider } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { TaskService } from './taskService';
import { ValidationError } from '../errors';

export interface ImageGenerationInput {
  dramaId: number;
  prompt: string;
  model?: string;
  provider?: string;
  size?: string;
  aspectRatio?: string;
  storyboardId?: number | null;
  sceneId?: number | null;
  characterId?: number | null;
  propId?: number | null;
  referenceImages: string[];
}

export interface ImageGenerationRow {
  id: number;
  drama_id: number;
  storyboard_id: number | null;
  scene_id: number | null;
  character_id: number | null;
  prop_id: number | null;
  provider: string | null;
  prompt: string;
  model: string | null;
  size: string | null;
  aspect_ratio: string | null;
  reference_images: string;
  image_url: string | null;
  local_path: string | null;
  status: string;
  task_id: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export class ImageGenerationService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly config: AppConfig,
    private readonly configs: AiConfigService,
    private readonly tasks: TaskService,
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
  ) {}

  list(dramaId?: number): ImageGenerationRow[] {
    return dramaId
      ? this.db.prepare('SELECT * FROM image_generations WHERE drama_id = ? ORDER BY id DESC').all(dramaId) as ImageGenerationRow[]
      : this.db.prepare('SELECT * FROM image_generations ORDER BY id DESC').all() as ImageGenerationRow[];
  }

  get(id: number): ImageGenerationRow | undefined {
    return this.db.prepare('SELECT * FROM image_generations WHERE id = ?').get(id) as ImageGenerationRow | undefined;
  }

  create(input: ImageGenerationInput): ImageGenerationRow {
    const aiConfig = this.configs.select('image', input.provider, input.model);
    const model = input.model || aiConfig.default_model || aiConfig.model[0];
    if (!model) throw new ValidationError('图片配置没有可用模型');
    const adapter = this.registry.require({ kind: 'image', config: aiConfig, model });
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO image_generations (
        drama_id, storyboard_id, scene_id, character_id, prop_id, provider, prompt, model,
        size, aspect_ratio, reference_images, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      input.dramaId,
      input.storyboardId ?? null,
      input.sceneId ?? null,
      input.characterId ?? null,
      input.propId ?? null,
      aiConfig.provider,
      input.prompt,
      model,
      input.size ?? null,
      input.aspectRatio ?? null,
      JSON.stringify(input.referenceImages),
      now,
      now,
    );
    const id = Number(insert.lastInsertRowid);
    const taskId = this.tasks.run('image_generation', String(id), async (reporter) => {
      this.mark(id, 'processing');
      reporter.progress(5, '正在提交图片生成');
      try {
        const result = await runImageProvider(adapter, {
          config: aiConfig,
          log: this.log,
          db: this.db,
          resolveMediaReference: async (source) => this.publicReference(source),
        }, {
          prompt: input.prompt,
          model,
          size: input.size || input.aspectRatio,
          referenceImages: input.referenceImages,
        });
        if (result.status === 'failed') throw new Error(result.error || '图片生成失败');
        if (!result.imageUrl) throw new Error('图片供应商没有返回图片地址');
        this.complete(id, result.imageUrl, input);
        reporter.progress(100, '图片生成完成');
        return { image_url: result.imageUrl, generation_id: id };
      } catch (error) {
        this.fail(id, error);
        throw error;
      }
    });
    this.db.prepare('UPDATE image_generations SET task_id = ?, updated_at = ? WHERE id = ?').run(taskId, new Date().toISOString(), id);
    return this.get(id) as ImageGenerationRow;
  }

  private complete(id: number, imageUrl: string, input: ImageGenerationInput): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE image_generations SET status = 'completed', image_url = ?, error_msg = NULL, updated_at = ?, completed_at = ? WHERE id = ?
    `).run(imageUrl, now, now, id);
    if (input.characterId) this.db.prepare('UPDATE characters SET image_url = ?, updated_at = ? WHERE id = ?').run(imageUrl, now, input.characterId);
    if (input.sceneId) this.db.prepare('UPDATE scenes SET image_url = ?, updated_at = ? WHERE id = ?').run(imageUrl, now, input.sceneId);
    if (input.propId) this.db.prepare('UPDATE props SET image_url = ?, updated_at = ? WHERE id = ?').run(imageUrl, now, input.propId);
    if (input.storyboardId) this.db.prepare('UPDATE storyboards SET image_url = ?, updated_at = ? WHERE id = ?').run(imageUrl, now, input.storyboardId);
  }

  private mark(id: number, status: string): void {
    this.db.prepare('UPDATE image_generations SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  }

  private fail(id: number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.db.prepare(`UPDATE image_generations SET status = 'failed', error_msg = ?, updated_at = ? WHERE id = ?`)
      .run(message, new Date().toISOString(), id);
  }

  private publicReference(source: string): string | undefined {
    if (/^https?:\/\//iu.test(source) || /^data:/iu.test(source)) return source;
    if (!source.startsWith('/static/')) return undefined;
    const base = this.config.storage?.base_url?.replace(/\/+$/u, '') ?? 'http://localhost:5679/static';
    return `${base}/${source.slice('/static/'.length)}`;
  }
}

export function imageReferences(row: ImageGenerationRow): string[] {
  return parseJson<string[]>(row.reference_images, []);
}
