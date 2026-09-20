import type { ProviderRegistry } from '../providers';
import { runImageProvider } from '../providers';
import type { Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { TaskService } from './taskService';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveError, MediaArchiveService } from './mediaArchiveService';

export interface ImageGenerationInput {
  dramaId: number;
  prompt: string;
  model?: string;
  provider?: string;
  size?: string;
  aspectRatio?: string;
  storyboardId?: number | null;
  projectAssetId?: number | null;
  referenceImages: string[];
}

export interface ImageGenerationRow {
  id: number;
  drama_id: number;
  project_asset_id: number | null;
  storyboard_id: number | null;
  provider: string | null;
  prompt: string;
  model: string | null;
  size: string | null;
  aspect_ratio: string | null;
  reference_images: string;
  image_url: string | null;
  source_url: string | null;
  local_path: string | null;
  media_type: string | null;
  file_size: number | null;
  failure_stage: string | null;
  status: string;
  task_id: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  available: boolean;
}

export class ImageGenerationService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly mediaReferences: MediaReferenceService,
    private readonly mediaArchive: MediaArchiveService,
    private readonly configs: AiConfigService,
    private readonly tasks: TaskService,
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
  ) {}

  list(dramaId?: number): ImageGenerationRow[] {
    const rows = dramaId
      ? this.db.prepare('SELECT * FROM image_generations WHERE drama_id = ? ORDER BY id DESC').all(dramaId) as ImageGenerationRow[]
      : this.db.prepare('SELECT * FROM image_generations ORDER BY id DESC').all() as ImageGenerationRow[];
    return rows.map((row) => this.present(row));
  }

  get(id: number): ImageGenerationRow | undefined {
    const row = this.db.prepare('SELECT * FROM image_generations WHERE id = ?').get(id) as ImageGenerationRow | undefined;
    return row ? this.present(row) : undefined;
  }

  select(id: number): ImageGenerationRow {
    const row = this.get(id);
    if (!row) throw new ValidationError('图片生成记录不存在');
    if (row.status !== 'completed' || !row.image_url || !row.local_path || !row.available) throw new ValidationError('只能选用本地文件真实存在的已完成图片');
    const now = new Date().toISOString();
    const target = row.project_asset_id
      ? ['project_assets', row.project_asset_id] as const
      : row.storyboard_id ? ['storyboards', row.storyboard_id] as const : undefined;
    if (!target) throw new ValidationError('这条通用图片历史没有可切换的业务资产');
    if (target[0] === 'storyboards') {
      this.db.prepare('UPDATE storyboards SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.image_url, row.id, now, target[1]);
    } else {
      this.db.prepare('UPDATE project_assets SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.image_url, row.local_path, row.id, now, target[1]);
    }
    return row;
  }

  async importLocal(input: {
    dramaId: number;
    projectAssetId?: number;
    storyboardId?: number;
    sourcePath: string;
    prompt?: string;
  }): Promise<ImageGenerationRow> {
    if (!input.projectAssetId && !input.storyboardId) {
      throw new ValidationError('本地上传必须指定项目资产或分镜');
    }
    if (input.projectAssetId && input.storyboardId) {
      throw new ValidationError('本地上传不能同时指定项目资产和分镜');
    }
    this.assertTargetAvailable({
      dramaId: input.dramaId,
      projectAssetId: input.projectAssetId,
      storyboardId: input.storyboardId,
      prompt: input.prompt ?? '本地上传',
      referenceImages: [],
    });
    const now = new Date().toISOString();
    const prompt = (input.prompt ?? '本地上传').trim() || '本地上传';
    const insert = this.db.prepare(`
      INSERT INTO image_generations (
        drama_id, project_asset_id, storyboard_id, provider, prompt, reference_images, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'local-upload', ?, '[]', 'pending', ?, ?)
    `).run(input.dramaId, input.projectAssetId ?? null, input.storyboardId ?? null, prompt, now, now);
    const id = Number(insert.lastInsertRowid);
    this.log.audit?.('image.generation.upload.started', {
      generationId: id,
      projectId: input.dramaId,
      projectAssetId: input.projectAssetId,
      storyboardId: input.storyboardId,
    });
    try {
      const archived = await this.mediaArchive.importFile({
        projectId: input.dramaId,
        generationId: id,
        kind: 'image',
        sourcePath: input.sourcePath,
      });
      this.complete(id, 'local-upload', archived, {
        dramaId: input.dramaId,
        projectAssetId: input.projectAssetId,
        storyboardId: input.storyboardId,
        prompt,
        referenceImages: [],
      });
      this.log.audit?.('image.generation.upload.completed', {
        generationId: id,
        projectId: input.dramaId,
        projectAssetId: input.projectAssetId,
        storyboardId: input.storyboardId,
        archived,
      });
      return this.get(id) as ImageGenerationRow;
    } catch (error) {
      this.fail(id, error, 'archive');
      this.log.audit?.('image.generation.upload.failed', {
        generationId: id,
        projectId: input.dramaId,
        projectAssetId: input.projectAssetId,
        storyboardId: input.storyboardId,
        error,
      });
      throw error;
    }
  }

  clearStoryboardImage(storyboardId: number): void {
    const now = new Date().toISOString();
    const changed = this.db.prepare(
      'UPDATE storyboards SET image_url = NULL, current_image_generation_id = NULL, updated_at = ? WHERE id = ?',
    ).run(now, storyboardId).changes;
    if (!changed) throw new NotFoundError('分镜不存在');
    this.log.audit?.('image.generation.cleared', { storyboardId });
  }

  create(input: ImageGenerationInput): ImageGenerationRow {
    this.assertTargetAvailable(input);
    const references = unique(input.referenceImages);
    const mode = references.length ? 'image-to-image' : 'text-to-image';
    const aiConfig = this.configs.select('image', input.provider, input.model, {
      mode,
      referenceImageCount: references.length,
      aspectRatio: input.aspectRatio,
      requiresAspectRatio: true,
    });
    const model = input.model || aiConfig.default_model || aiConfig.model[0];
    if (!model) throw new ValidationError('图片配置没有可用模型');
    const aspectRatio = this.configs.resolveAspectRatio('image', aiConfig.provider, model, input.aspectRatio);
    const adapter = this.registry.require({ kind: 'image', config: aiConfig, model });
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO image_generations (
        drama_id, project_asset_id, storyboard_id, provider, prompt, model,
        size, aspect_ratio, reference_images, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      input.dramaId,
      input.projectAssetId ?? null,
      input.storyboardId ?? null,
      aiConfig.provider,
      input.prompt,
      model,
      input.size ?? null,
      aspectRatio,
      JSON.stringify(references),
      now,
      now,
    );
    const id = Number(insert.lastInsertRowid);
    this.log.audit?.('image.generation.created', {
      generationId: id,
      projectId: input.dramaId,
      target: { projectAssetId: input.projectAssetId, storyboardId: input.storyboardId },
      provider: aiConfig.provider,
      model,
      mode,
      aspectRatio,
      referenceCount: references.length,
      prompt: input.prompt,
    });
    const taskId = this.tasks.run('image_generation', String(id), async (reporter) => {
      this.mark(id, 'processing');
      reporter.stage('正在生成');
      try {
        this.log.audit?.('image.provider.started', { generationId: id, provider: aiConfig.provider, model });
        const result = await runImageProvider(adapter, {
          config: aiConfig,
          log: this.log,
          db: this.db,
          resolveMediaReference: this.mediaReferences.resolve,
        }, {
          prompt: input.prompt,
          model,
          size: input.size,
          aspectRatio,
          referenceImages: references,
          signal: reporter.signal,
        });
        this.log.audit?.('image.provider.completed', { generationId: id, provider: aiConfig.provider, model, result });
        reporter.throwIfCancelled();
        if (result.status === 'failed') throw new Error(result.error || '图片生成失败');
        if (!result.imageUrl) throw new Error('图片供应商没有返回图片地址');
        reporter.stage('归档中');
        const archived = await this.mediaArchive.archiveRemote({
          projectId: input.dramaId,
          generationId: id,
          kind: 'image',
          sourceUrl: result.imageUrl,
          signal: reporter.signal,
        });
        try {
          reporter.throwIfCancelled();
          this.complete(id, result.imageUrl, archived, input);
          this.log.audit?.('image.generation.completed', {
            generationId: id,
            projectId: input.dramaId,
            target: { projectAssetId: input.projectAssetId, storyboardId: input.storyboardId },
            archived,
          });
        } catch (error) {
          await this.mediaArchive.remove(archived.relativePath).catch(() => undefined);
          if (reporter.signal.aborted) throw error;
          throw new MediaArchiveError('本地归档失败：无法提交生成记录和当前 generation 指针', { cause: error });
        }
        return { image_url: archived.publicUrl, source_url: result.imageUrl, local_path: archived.relativePath, generation_id: id };
      } catch (error) {
        if (reporter.signal.aborted) this.mark(id, 'cancelled');
        else this.fail(id, error, error instanceof MediaArchiveError ? 'archive' : 'provider');
        this.log.audit?.('image.generation.failed', {
          generationId: id,
          projectId: input.dramaId,
          stage: error instanceof MediaArchiveError ? 'archive' : 'provider',
          error,
        });
        throw error;
      }
    });
    this.db.prepare('UPDATE image_generations SET task_id = ?, updated_at = ? WHERE id = ?').run(taskId, new Date().toISOString(), id);
    return this.get(id) as ImageGenerationRow;
  }

  private complete(
    id: number,
    sourceUrl: string,
    archived: { publicUrl: string; relativePath: string; mediaType: string; fileSize: number },
    input: ImageGenerationInput,
  ): void {
    const now = new Date().toISOString();
    const commit = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE image_generations SET status = 'completed', image_url = ?, source_url = ?, local_path = ?, media_type = ?,
          file_size = ?, failure_stage = NULL, error_msg = NULL, updated_at = ?, completed_at = ? WHERE id = ?
      `).run(archived.publicUrl, sourceUrl, archived.relativePath, archived.mediaType, archived.fileSize, now, now, id);
      if (input.projectAssetId) this.db.prepare('UPDATE project_assets SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, archived.relativePath, id, now, input.projectAssetId);
      if (input.storyboardId) this.db.prepare('UPDATE storyboards SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, id, now, input.storyboardId);
    });
    commit();
  }

  private assertTargetAvailable(input: ImageGenerationInput): void {
    const target = input.projectAssetId
      ? ['project_asset_id', input.projectAssetId, '项目资产'] as const
      : input.storyboardId ? ['storyboard_id', input.storyboardId, '分镜'] as const : undefined;
    if (!target) return;
    const active = this.db.prepare(`SELECT id FROM image_generations WHERE ${target[0]} = ? AND status IN ('pending', 'processing') LIMIT 1`)
      .get(target[1]) as { id: number } | undefined;
    const activeVideo = target[0] === 'storyboard_id'
      ? this.db.prepare("SELECT id FROM video_generations WHERE storyboard_id = ? AND status IN ('pending', 'processing') LIMIT 1").get(target[1])
      : undefined;
    if (active || activeVideo) throw new ConflictError(`${target[2]}已有进行中的生成任务，请等待完成或先取消`);
  }

  private mark(id: number, status: string): void {
    this.db.prepare('UPDATE image_generations SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  }

  private fail(id: number, error: unknown, stage: 'provider' | 'archive'): void {
    const message = error instanceof Error ? error.message : String(error);
    this.db.prepare(`UPDATE image_generations SET status = 'failed', failure_stage = ?, error_msg = ?, updated_at = ? WHERE id = ?`)
      .run(stage, message, new Date().toISOString(), id);
  }

  private present(row: ImageGenerationRow): ImageGenerationRow {
    return { ...row, available: row.status === 'completed' && this.mediaArchive.isAvailable(row.local_path) };
  }

}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function imageReferences(row: ImageGenerationRow): string[] {
  return parseJson<string[]>(row.reference_images, []);
}
