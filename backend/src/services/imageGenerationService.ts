import type { ProviderRegistry } from '../providers';
import { runImageProvider } from '../providers';
import type { Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { TaskService } from './taskService';
import { ConflictError, ValidationError } from '../errors';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveError, MediaArchiveService } from './mediaArchiveService';

export interface ImageGenerationInput {
  dramaId?: number | null;
  prompt: string;
  model?: string;
  provider?: string;
  size?: string;
  aspectRatio?: string;
  storyboardId?: number | null;
  sceneId?: number | null;
  characterId?: number | null;
  propId?: number | null;
  libraryItemId?: number | null;
  projectAssetId?: number | null;
  referenceImages: string[];
}

export interface ImageGenerationRow {
  id: number;
  drama_id: number | null;
  library_item_id: number | null;
  project_asset_id: number | null;
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
    const target = row.library_item_id
      ? ['asset_library_items', row.library_item_id]
      : row.project_asset_id
        ? ['project_assets', row.project_asset_id]
        : row.character_id
      ? ['characters', row.character_id]
      : row.scene_id
        ? ['scenes', row.scene_id]
        : row.prop_id
          ? ['props', row.prop_id]
          : row.storyboard_id ? ['storyboards', row.storyboard_id] : undefined;
    if (!target) throw new ValidationError('这条通用图片历史没有可切换的业务资产');
    if (target[0] === 'storyboards') {
      this.db.prepare('UPDATE storyboards SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.image_url, row.id, now, target[1]);
    } else if (target[0] === 'asset_library_items') {
      this.db.prepare('UPDATE asset_library_items SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.image_url, row.local_path, row.id, now, target[1]);
    } else if (target[0] === 'project_assets') {
      this.db.prepare('UPDATE project_assets SET image_url = ?, local_path = ?, current_image_generation_id = ?, locked_image_generation_id = ?, updated_at = ? WHERE id = ?')
        .run(row.image_url, row.local_path, row.id, row.id, now, target[1]);
    } else {
      this.db.prepare(`UPDATE ${target[0]} SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?`)
        .run(row.image_url, row.local_path, row.id, now, target[1]);
    }
    return row;
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
        drama_id, library_item_id, project_asset_id, storyboard_id, scene_id, character_id, prop_id, provider, prompt, model,
        size, aspect_ratio, reference_images, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      input.dramaId ?? null,
      input.libraryItemId ?? null,
      input.projectAssetId ?? null,
      input.storyboardId ?? null,
      input.sceneId ?? null,
      input.characterId ?? null,
      input.propId ?? null,
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
      target: { libraryItemId: input.libraryItemId, projectAssetId: input.projectAssetId, characterId: input.characterId, sceneId: input.sceneId, propId: input.propId, storyboardId: input.storyboardId },
      provider: aiConfig.provider,
      model,
      mode,
      aspectRatio,
      referenceCount: references.length,
      prompt: input.prompt,
    });
    const taskId = this.tasks.run('image_generation', String(id), async (reporter) => {
      this.mark(id, 'processing');
      reporter.stage('正在提交图片生成');
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
        reporter.stage('供应商生成完成，正在保存到本地');
        const archived = await this.mediaArchive.archiveRemote({
          projectId: input.dramaId ?? 0,
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
          target: { libraryItemId: input.libraryItemId, projectAssetId: input.projectAssetId, characterId: input.characterId, sceneId: input.sceneId, propId: input.propId, storyboardId: input.storyboardId },
            archived,
          });
        } catch (error) {
          await this.mediaArchive.remove(archived.relativePath).catch(() => undefined);
          if (reporter.signal.aborted) throw error;
          throw new MediaArchiveError('本地归档失败：无法提交生成记录和当前版本指针', { cause: error });
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
      if (input.libraryItemId) this.db.prepare('UPDATE asset_library_items SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, archived.relativePath, id, now, input.libraryItemId);
      if (input.projectAssetId) this.db.prepare('UPDATE project_assets SET image_url = ?, local_path = ?, current_image_generation_id = ?, locked_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, archived.relativePath, id, id, now, input.projectAssetId);
      if (input.characterId) this.db.prepare('UPDATE characters SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, archived.relativePath, id, now, input.characterId);
      if (input.sceneId) this.db.prepare('UPDATE scenes SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, archived.relativePath, id, now, input.sceneId);
      if (input.propId) this.db.prepare('UPDATE props SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, archived.relativePath, id, now, input.propId);
      if (input.storyboardId) this.db.prepare('UPDATE storyboards SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?').run(archived.publicUrl, id, now, input.storyboardId);
    });
    commit();
  }

  private assertTargetAvailable(input: ImageGenerationInput): void {
    const target = input.libraryItemId
      ? ['library_item_id', input.libraryItemId, '全局资产'] as const
      : input.projectAssetId
        ? ['project_asset_id', input.projectAssetId, '项目资产'] as const
        : input.storyboardId
          ? ['storyboard_id', input.storyboardId, '分镜'] as const
          : input.characterId
            ? ['character_id', input.characterId, '角色资产'] as const
            : input.sceneId
              ? ['scene_id', input.sceneId, '场景资产'] as const
              : input.propId ? ['prop_id', input.propId, '道具资产'] as const : undefined;
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
