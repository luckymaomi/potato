import type { ProviderRegistry } from '../providers';
import { runImageProvider } from '../providers';
import type { Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { TaskService } from './taskService';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveError, MediaArchiveService } from './mediaArchiveService';
import { AssetRepository } from './assetRepository';

export interface ImageGenerationInput {
  dramaId: number;
  prompt: string;
  model?: string;
  provider?: string;
  size?: string;
  aspectRatio?: string;
  panelId?: number | null;
  projectAssetId?: number | null;
  referenceImages: string[];
}

export interface ImageGenerationRow {
  id: number;
  drama_id: number;
  project_asset_id: number | null;
  panel_id: number | null;
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
  archive_attempts: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  available: boolean;
}

const ARCHIVE_MAX_ATTEMPTS = 5;
const ARCHIVE_RETRY_MS = 8_000;

export class ImageGenerationService {
  private archiveRetryTimer?: ReturnType<typeof setInterval>;
  private readonly archiveInFlight = new Set<number>();

  constructor(
    private readonly db: SQLiteDatabase,
    private readonly mediaReferences: MediaReferenceService,
    private readonly mediaArchive: MediaArchiveService,
    private readonly configs: AiConfigService,
    private readonly tasks: TaskService,
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
    private readonly assets: AssetRepository,
  ) {}

  /** 后台轮询 status=remote 且未超过重试上限的记录，有界归档后切本地指针。 */
  startArchiveRetryLoop(): void {
    if (this.archiveRetryTimer) return;
    this.archiveRetryTimer = setInterval(() => {
      void this.retryPendingArchives().catch((error) => {
        this.log.audit?.('image.archive.retry.loop_failed', { error });
      });
    }, ARCHIVE_RETRY_MS);
    if (typeof this.archiveRetryTimer.unref === 'function') {
      this.archiveRetryTimer.unref();
    }
  }

  stopArchiveRetryLoop(): void {
    if (!this.archiveRetryTimer) return;
    clearInterval(this.archiveRetryTimer);
    this.archiveRetryTimer = undefined;
  }

  async retryPendingArchives(limit = 3): Promise<number> {
    const rows = this.db
      .prepare(
        `
      SELECT id FROM image_generations
      WHERE status = 'remote'
        AND source_url IS NOT NULL AND trim(source_url) <> ''
        AND (local_path IS NULL OR trim(local_path) = '')
        AND COALESCE(archive_attempts, 0) < ?
      ORDER BY updated_at ASC
      LIMIT ?
    `,
      )
      .all(ARCHIVE_MAX_ATTEMPTS, limit) as Array<{ id: number }>;
    let archived = 0;
    for (const row of rows) {
      const ok = await this.archiveGeneration(row.id);
      if (ok) archived += 1;
    }
    return archived;
  }

  list(dramaId?: number): ImageGenerationRow[] {
    this.reclaimStaleActiveGenerations();
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
    const remoteOk = row.status === 'remote' && Boolean(row.image_url?.trim());
    const localOk =
      row.status === 'completed' &&
      Boolean(row.image_url) &&
      Boolean(row.local_path) &&
      row.available;
    if (!remoteOk && !localOk) {
      throw new ValidationError('只能选用远程预览或本地文件真实存在的已完成图片');
    }
    const now = new Date().toISOString();
    const target = row.project_asset_id
      ? (['project_assets', row.project_asset_id] as const)
      : row.panel_id
        ? (['panels', row.panel_id] as const)
        : undefined;
    if (!target) throw new ValidationError('这条通用图片历史没有可切换的业务资产');
    if (target[0] === 'panels') {
      this.db
        .prepare(
          'UPDATE panels SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?',
        )
        .run(row.image_url, row.id, now, target[1]);
      this.assets.markPanelImageChanged(target[1], { imageSelected: true });
    } else {
      this.db
        .prepare(
          'UPDATE project_assets SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?',
        )
        .run(
          row.image_url,
          row.status === 'completed' ? row.local_path : null,
          row.id,
          now,
          target[1],
        );
      this.assets.markAssetImageChanged(target[1]);
    }
    return row;
  }

  async importLocal(input: {
    dramaId: number;
    projectAssetId?: number;
    panelId?: number;
    sourcePath: string;
    prompt?: string;
  }): Promise<ImageGenerationRow> {
    if (!input.projectAssetId && !input.panelId) {
      throw new ValidationError('本地上传必须指定项目资产或分镜');
    }
    if (input.projectAssetId && input.panelId) {
      throw new ValidationError('本地上传不能同时指定项目资产和分镜');
    }
    this.assertTargetAvailable({
      dramaId: input.dramaId,
      projectAssetId: input.projectAssetId,
      panelId: input.panelId,
      prompt: input.prompt ?? '本地上传',
      referenceImages: [],
    });
    const now = new Date().toISOString();
    const prompt = (input.prompt ?? '本地上传').trim() || '本地上传';
    const insert = this.db.prepare(`
      INSERT INTO image_generations (
        drama_id, project_asset_id, panel_id, provider, prompt, reference_images, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'local-upload', ?, '[]', 'pending', ?, ?)
    `).run(input.dramaId, input.projectAssetId ?? null, input.panelId ?? null, prompt, now, now);
    const id = Number(insert.lastInsertRowid);
    this.log.audit?.('image.generation.upload.started', {
      generationId: id,
      projectId: input.dramaId,
      projectAssetId: input.projectAssetId,
      panelId: input.panelId,
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
        panelId: input.panelId,
        prompt,
        referenceImages: [],
      });
      this.log.audit?.('image.generation.upload.completed', {
        generationId: id,
        projectId: input.dramaId,
        projectAssetId: input.projectAssetId,
        panelId: input.panelId,
        archived,
      });
      return this.get(id) as ImageGenerationRow;
    } catch (error) {
      this.fail(id, error, 'archive');
      this.log.audit?.('image.generation.upload.failed', {
        generationId: id,
        projectId: input.dramaId,
        projectAssetId: input.projectAssetId,
        panelId: input.panelId,
        error,
      });
      throw error;
    }
  }

  clearPanelImage(panelId: number): void {
    const now = new Date().toISOString();
    const changed = this.db.prepare(
      'UPDATE panels SET image_url = NULL, current_image_generation_id = NULL, updated_at = ? WHERE id = ?',
    ).run(now, panelId).changes;
    if (!changed) throw new NotFoundError('分镜不存在');
    this.assets.markPanelImageChanged(panelId, { imageSelected: false });
    this.log.audit?.('image.generation.cleared', { panelId });
  }

  async remove(id: number): Promise<{ removed: boolean }> {
    const row = this.get(id);
    if (!row) throw new NotFoundError('图片生成记录不存在');
    if (row.status === 'pending' || row.status === 'processing') {
      throw new ValidationError('进行中的生成不能删除，请等完成或归档后再删');
    }
    const now = new Date().toISOString();
    const clearCurrent = this.db.transaction(() => {
      if (row.project_asset_id) {
        const asset = this.db.prepare(
          'SELECT current_image_generation_id FROM project_assets WHERE id = ?',
        ).get(row.project_asset_id) as { current_image_generation_id: number | null } | undefined;
        if (asset?.current_image_generation_id === row.id) {
          this.db.prepare(
            'UPDATE project_assets SET image_url = NULL, local_path = NULL, current_image_generation_id = NULL, updated_at = ? WHERE id = ?',
          ).run(now, row.project_asset_id);
        }
      }
      if (row.panel_id) {
        const panel = this.db.prepare(
          'SELECT current_image_generation_id FROM panels WHERE id = ?',
        ).get(row.panel_id) as { current_image_generation_id: number | null } | undefined;
        if (panel?.current_image_generation_id === row.id) {
          this.db.prepare(
            'UPDATE panels SET image_url = NULL, current_image_generation_id = NULL, updated_at = ? WHERE id = ?',
          ).run(now, row.panel_id);
        }
      }
      this.db.prepare('DELETE FROM image_generations WHERE id = ?').run(row.id);
    });
    clearCurrent();
    if (row.project_asset_id) this.assets.markAssetImageChanged(row.project_asset_id);
    if (row.panel_id) this.assets.markPanelImageChanged(row.panel_id, { imageSelected: false });
    if (row.local_path) {
      await this.mediaArchive.remove(row.local_path).catch(() => undefined);
    }
    this.log.audit?.('image.generation.removed', {
      generationId: row.id,
      projectId: row.drama_id,
      projectAssetId: row.project_asset_id,
      panelId: row.panel_id,
      status: row.status,
    });
    return { removed: true };
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
    const model = input.model || aiConfig.default_model;
    if (!model) throw new ValidationError('图片配置没有可用模型');
    const aspectRatio = this.configs.resolveAspectRatio('image', aiConfig.provider, model, input.aspectRatio);
    const adapter = this.registry.require({ kind: 'image', config: aiConfig, model });
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO image_generations (
        drama_id, project_asset_id, panel_id, provider, prompt, model,
        size, aspect_ratio, reference_images, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      input.dramaId,
      input.projectAssetId ?? null,
      input.panelId ?? null,
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
      target: { projectAssetId: input.projectAssetId, panelId: input.panelId },
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
        // 供应商成功：先挂远程预览指针，任务可结束；本地归档失败不抹掉可见图。
        this.acceptRemote(id, result.imageUrl, input);
        reporter.stage('正在保存到本地');
        const archivedOk = await this.tryArchiveOnce(id, result.imageUrl, input, reporter.signal);
        const current = this.get(id) as ImageGenerationRow;
        this.log.audit?.('image.generation.completed', {
          generationId: id,
          projectId: input.dramaId,
          target: { projectAssetId: input.projectAssetId, panelId: input.panelId },
          remote: current.status === 'remote',
          archived: archivedOk,
        });
        return {
          image_url: current.image_url,
          source_url: current.source_url,
          local_path: current.local_path,
          generation_id: id,
          status: current.status,
        };
      } catch (error) {
        if (reporter.signal.aborted) {
          const current = this.get(id);
          if (current?.status === 'remote' || current?.status === 'completed') {
            return {
              image_url: current.image_url,
              source_url: current.source_url,
              local_path: current.local_path,
              generation_id: id,
              status: current.status,
            };
          }
          this.mark(id, 'cancelled');
        } else this.fail(id, error, error instanceof MediaArchiveError ? 'archive' : 'provider');
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

  private async tryArchiveOnce(
    id: number,
    sourceUrl: string,
    input: ImageGenerationInput,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (this.archiveInFlight.has(id)) return false;
    this.archiveInFlight.add(id);
    try {
      const archived = await this.mediaArchive.archiveRemote({
        projectId: input.dramaId,
        generationId: id,
        kind: 'image',
        sourceUrl,
        signal,
      });
      try {
        this.finalizeLocal(id, sourceUrl, archived, input);
        return true;
      } catch (error) {
        await this.mediaArchive.remove(archived.relativePath).catch(() => undefined);
        this.noteArchiveAttempt(
          id,
          new MediaArchiveError('本地归档失败：无法提交生成记录和当前 generation 指针', {
            cause: error,
          }),
        );
        return false;
      }
    } catch (error) {
      if (signal?.aborted) return false;
      this.noteArchiveAttempt(id, error);
      return false;
    } finally {
      this.archiveInFlight.delete(id);
    }
  }

  private async archiveGeneration(id: number): Promise<boolean> {
    const row = this.get(id);
    if (!row || row.status !== 'remote') return false;
    const sourceUrl = row.source_url?.trim();
    if (!sourceUrl) return false;
    if ((row.archive_attempts ?? 0) >= ARCHIVE_MAX_ATTEMPTS) return false;
    return this.tryArchiveOnce(
      id,
      sourceUrl,
      {
        dramaId: row.drama_id,
        projectAssetId: row.project_asset_id ?? undefined,
        panelId: row.panel_id ?? undefined,
        prompt: row.prompt,
        referenceImages: [],
      },
    );
  }

  /** 供应商已出图：指针先指向远程 URL，status=remote。 */
  private acceptRemote(
    id: number,
    sourceUrl: string,
    input: ImageGenerationInput,
  ): void {
    const now = new Date().toISOString();
    const commit = this.db.transaction(() => {
      this.db
        .prepare(
          `
        UPDATE image_generations SET status = 'remote', image_url = ?, source_url = ?, local_path = NULL,
          media_type = NULL, file_size = NULL, failure_stage = NULL, error_msg = NULL,
          archive_attempts = 0, updated_at = ?, completed_at = ? WHERE id = ?
      `,
        )
        .run(sourceUrl, sourceUrl, now, now, id);
      if (input.projectAssetId) {
        this.db
          .prepare(
            'UPDATE project_assets SET image_url = ?, local_path = NULL, current_image_generation_id = ?, updated_at = ? WHERE id = ?',
          )
          .run(sourceUrl, id, now, input.projectAssetId);
      }
      if (input.panelId) {
        this.db
          .prepare(
            'UPDATE panels SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?',
          )
          .run(sourceUrl, id, now, input.panelId);
      }
    });
    commit();
    if (input.projectAssetId) this.assets.markAssetImageChanged(input.projectAssetId);
    if (input.panelId) this.assets.markPanelImageChanged(input.panelId, { imageSelected: true });
  }

  private noteArchiveAttempt(id: number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE image_generations
      SET archive_attempts = COALESCE(archive_attempts, 0) + 1,
          failure_stage = 'archive',
          error_msg = ?,
          updated_at = ?
      WHERE id = ? AND status = 'remote'
    `,
      )
      .run(message, now, id);
    this.log.audit?.('image.archive.attempt_failed', { generationId: id, error: message });
  }

  private complete(
    id: number,
    sourceUrl: string,
    archived: { publicUrl: string; relativePath: string; mediaType: string; fileSize: number },
    input: ImageGenerationInput,
  ): void {
    this.finalizeLocal(id, sourceUrl, archived, input);
  }

  private finalizeLocal(
    id: number,
    sourceUrl: string,
    archived: { publicUrl: string; relativePath: string; mediaType: string; fileSize: number },
    input: ImageGenerationInput,
  ): void {
    const now = new Date().toISOString();
    const commit = this.db.transaction(() => {
      this.db
        .prepare(
          `
        UPDATE image_generations SET status = 'completed', image_url = ?, source_url = ?, local_path = ?, media_type = ?,
          file_size = ?, failure_stage = NULL, error_msg = NULL, updated_at = ?, completed_at = ? WHERE id = ?
      `,
        )
        .run(
          archived.publicUrl,
          sourceUrl,
          archived.relativePath,
          archived.mediaType,
          archived.fileSize,
          now,
          now,
          id,
        );
      if (input.projectAssetId) {
        this.db
          .prepare(
            'UPDATE project_assets SET image_url = ?, local_path = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?',
          )
          .run(
            archived.publicUrl,
            archived.relativePath,
            id,
            now,
            input.projectAssetId,
          );
      }
      if (input.panelId) {
        this.db
          .prepare(
            'UPDATE panels SET image_url = ?, current_image_generation_id = ?, updated_at = ? WHERE id = ?',
          )
          .run(archived.publicUrl, id, now, input.panelId);
      }
    });
    commit();
    if (input.projectAssetId) this.assets.markAssetImageChanged(input.projectAssetId);
    if (input.panelId) this.assets.markPanelImageChanged(input.panelId, { imageSelected: true });
  }

  private assertTargetAvailable(input: ImageGenerationInput): void {
    this.reclaimStaleActiveGenerations();
    const target = input.projectAssetId
      ? ['project_asset_id', input.projectAssetId, '项目资产'] as const
      : input.panelId ? ['panel_id', input.panelId, '分镜'] as const : undefined;
    if (!target) return;
    const active = this.db.prepare(`SELECT id FROM image_generations WHERE ${target[0]} = ? AND status IN ('pending', 'processing') LIMIT 1`)
      .get(target[1]) as { id: number } | undefined;
    if (active) throw new ConflictError(`${target[2]}已有进行中的生成任务，请等待完成或先取消`);
  }

  /** 回收任务已终态/丢失但仍卡在 pending|processing 的生成记录（常见于服务重启）。 */
  reclaimStaleActiveGenerations(): number {
    const rows = this.db.prepare(`
      SELECT id, task_id FROM image_generations WHERE status IN ('pending', 'processing')
    `).all() as Array<{ id: number; task_id: string | null }>;
    let changed = 0;
    for (const row of rows) {
      const task = row.task_id ? this.tasks.get(row.task_id) : undefined;
      if (!row.task_id || !task) {
        this.fail(row.id, new Error('生成任务已中断，请重新运行'), 'provider');
        changed += 1;
        continue;
      }
      if (task.status === 'failed') {
        this.fail(row.id, new Error(task.error || '生成任务已失败，请重新运行'), 'provider');
        changed += 1;
        continue;
      }
      if (task.status === 'cancelled') {
        this.mark(row.id, 'cancelled');
        this.db.prepare('UPDATE image_generations SET error_msg = ?, updated_at = ? WHERE id = ?')
          .run(task.message || '用户停止', new Date().toISOString(), row.id);
        changed += 1;
        continue;
      }
      if (task.status === 'completed') {
        this.fail(row.id, new Error('生成任务已结束但未完成归档，请重新运行'), 'archive');
        changed += 1;
      }
    }
    if (changed) this.log.audit?.('image.generation.reclaimed', { count: changed });
    return changed;
  }

  settleByTaskId(taskId: string, status: 'cancelled' | 'failed', message: string): number {
    const rows = this.db.prepare(`
      SELECT id FROM image_generations WHERE task_id = ? AND status IN ('pending', 'processing')
    `).all(taskId) as Array<{ id: number }>;
    for (const row of rows) {
      if (status === 'cancelled') {
        this.mark(row.id, 'cancelled');
        this.db.prepare('UPDATE image_generations SET error_msg = ?, updated_at = ? WHERE id = ?')
          .run(message, new Date().toISOString(), row.id);
      } else {
        this.fail(row.id, new Error(message), 'provider');
      }
    }
    return rows.length;
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
    return {
      ...row,
      archive_attempts: Number(row.archive_attempts ?? 0),
      available:
        row.status === 'completed' && this.mediaArchive.isAvailable(row.local_path),
    };
  }

}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function imageReferences(row: ImageGenerationRow): string[] {
  return parseJson<string[]>(row.reference_images, []);
}
