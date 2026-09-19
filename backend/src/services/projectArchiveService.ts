import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import * as unzipper from 'unzipper';
import { ValidationError } from '../errors';
import type { SQLiteDatabase } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import type { AssetLibraryItemRow, Drama, ProjectAssetRow } from '../types/domain';
import { AssetRepository } from './assetRepository';
import { MediaArchiveService } from './mediaArchiveService';
import { ProjectService } from './projectService';

interface ArchivePayload {
  format: 3;
  project: Drama;
  asset_library_items: AssetLibraryItemRow[];
  image_generations: Array<Record<string, unknown>>;
  video_generations: Array<Record<string, unknown>>;
}

interface ImportMaps {
  episodes: Map<number, number>;
  characters: Map<number, number>;
  scenes: Map<number, number>;
  props: Map<number, number>;
  storyboards: Map<number, number>;
  libraryItems: Map<number, number>;
  projectAssets: Map<number, number>;
  images: Map<number, number>;
  videos: Map<number, number>;
  urls: Map<string, string>;
}

export class ProjectArchiveService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly projects: ProjectService,
    private readonly assets: AssetRepository,
    private readonly mediaArchive: MediaArchiveService,
  ) {}

  async export(projectId: number, destination: string): Promise<void> {
    const project = this.projects.require(projectId);
    const archivalProject: Drama = { ...project };
    delete archivalProject.media_lifecycle;
    const projectAssets = project.project_assets ?? [];
    const libraryIds = projectAssets.flatMap((item) => item.library_item_id ? [item.library_item_id] : []);
    const libraryItems = rowsByIds<AssetLibraryItemRow>(this.db, 'asset_library_items', libraryIds);
    const referencedImageIds = new Set<number>([
      ...projectAssets.flatMap((item) => [item.current_image_generation_id, item.locked_image_generation_id]).filter((id): id is number => Boolean(id)),
      ...libraryItems.flatMap((item) => item.current_image_generation_id ? [item.current_image_generation_id] : []),
      ...(project.episodes ?? []).flatMap((episode) => (episode.storyboards ?? []).flatMap((shot) => shot.current_image_generation_id ? [shot.current_image_generation_id] : [])),
    ]);
    const projectImages = this.db.prepare('SELECT * FROM image_generations WHERE drama_id = ? ORDER BY id').all(projectId) as Array<Record<string, unknown>>;
    const referencedImages = rowsByIds<Record<string, unknown>>(this.db, 'image_generations', [...referencedImageIds]);
    const images = [...new Map([...projectImages, ...referencedImages].map((row) => [readNumber(row.id), row])).values()];
    const videos = this.db.prepare('SELECT * FROM video_generations WHERE drama_id = ? ORDER BY id').all(projectId) as Array<Record<string, unknown>>;
    const payload: ArchivePayload = { format: 3, project: archivalProject, asset_library_items: libraryItems, image_generations: images, video_generations: videos };
    const relativePaths = new Set<string>();
    [...images, ...videos].forEach((row) => {
      const localPath = readString(row.local_path);
      if (localPath) relativePaths.add(normalizeRelative(localPath));
    });
    for (const relativePath of relativePaths) {
      const absolute = this.mediaArchive.absolutePath(relativePath);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new ValidationError(`项目媒体缺失，无法导出：${relativePath}`);
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const output = fs.createWriteStream(destination, { flags: 'wx' });
    const zip = archiver('zip', { store: true });
    try {
      await new Promise<void>((resolve, reject) => {
        output.once('close', resolve);
        output.once('error', reject);
        zip.once('error', reject);
        zip.pipe(output);
        zip.append(JSON.stringify(payload, null, 2), { name: 'project.json' });
        for (const relativePath of relativePaths) {
          zip.file(this.mediaArchive.absolutePath(relativePath), { name: `media/${relativePath}` });
        }
        void zip.finalize().catch(reject);
      });
    } catch (error) {
      output.destroy();
      await fs.promises.rm(destination, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async import(archivePath: string): Promise<Drama> {
    const extractedRoot = await extractArchive(archivePath);
    try {
      const manifest = path.join(extractedRoot, 'project.json');
      if (!fs.existsSync(manifest)) throw new ValidationError('归档中缺少 project.json');
      const payload = parsePayload(await fs.promises.readFile(manifest, 'utf8'));
      const source = payload.project;
      const created = this.projects.create({ ...source, metadata: source.metadata });
      const maps: ImportMaps = {
        episodes: new Map(), characters: new Map(), scenes: new Map(), props: new Map(), storyboards: new Map(),
        libraryItems: new Map(), projectAssets: new Map(),
        images: new Map(), videos: new Map(), urls: new Map(),
      };
      try {
        this.importEpisodes(created.id, source, maps);
        this.importAssets(created.id, source, maps);
        this.importLibrary(payload.asset_library_items, maps);
        this.importProjectAssets(created.id, source.project_assets ?? [], maps);
        this.importStoryboards(source, maps);
        await this.importImages(extractedRoot, created.id, payload.image_generations, maps);
        await this.importVideos(extractedRoot, created.id, payload.video_generations, maps);
        this.applyCurrentVersions(source, payload.asset_library_items, maps);
        return this.projects.require(created.id);
      } catch (error) {
        this.projects.remove(created.id);
        throw error;
      }
    } finally {
      await fs.promises.rm(extractedRoot, { recursive: true, force: true });
    }
  }

  private importEpisodes(projectId: number, source: Drama, maps: ImportMaps): void {
    const episodes = source.episodes || [];
    this.projects.saveEpisodes(projectId, episodes);
    const imported = this.db.prepare('SELECT id, episode_number FROM episodes WHERE drama_id = ?').all(projectId) as Array<{ id: number; episode_number: number }>;
    episodes.forEach((episode) => {
      const target = imported.find((item) => item.episode_number === episode.episode_number);
      if (target) maps.episodes.set(episode.id, target.id);
    });
  }

  private importAssets(projectId: number, source: Drama, maps: ImportMaps): void {
    const characters = this.assets.syncCharacters(projectId, source.characters || []);
    (source.characters || []).forEach((item, index) => { const target = characters[index]; if (target) maps.characters.set(item.id, target.id); });
    const scenes = this.assets.syncScenes(projectId, source.scenes || []);
    (source.scenes || []).forEach((item, index) => { const target = scenes[index]; if (target) maps.scenes.set(item.id, target.id); });
    const props = this.assets.syncProps(projectId, source.props || []);
    (source.props || []).forEach((item, index) => { const target = props[index]; if (target) maps.props.set(item.id, target.id); });
  }

  private importLibrary(items: AssetLibraryItemRow[], maps: ImportMaps): void {
    for (const item of items) {
      const created = this.assets.createLibraryItem(item);
      maps.libraryItems.set(item.id, created.id);
    }
  }

  private importProjectAssets(projectId: number, items: ProjectAssetRow[], maps: ImportMaps): void {
    for (const item of items) {
      const libraryItemId = item.library_item_id ? maps.libraryItems.get(item.library_item_id) : undefined;
      const { dependency_asset_ids: _dependencies, ...fields } = item;
      const created = this.assets.createProjectAsset(projectId, libraryItemId
        ? { ...fields, from_library_item_id: libraryItemId }
        : { ...fields, library_item_id: undefined });
      this.assets.updateProjectAsset(created.id, fields);
      maps.projectAssets.set(item.id, created.id);
    }
    for (const item of items) {
      const targetId = maps.projectAssets.get(item.id);
      if (!targetId) continue;
      this.assets.updateProjectAsset(targetId, {
        dependency_asset_ids: item.dependency_asset_ids.map((id) => maps.projectAssets.get(id)).filter(Boolean),
      });
    }
  }

  private importStoryboards(source: Drama, maps: ImportMaps): void {
    (source.episodes || []).forEach((episode) => {
      const targetEpisode = maps.episodes.get(episode.id);
      if (!targetEpisode) return;
      const storyboards = this.assets.syncStoryboards(targetEpisode, (episode.storyboards || []).map((item) => ({
        ...item,
        character_ids: item.character_ids.map((id) => maps.characters.get(id)).filter(Boolean),
        scene_ids: item.scene_ids.map((id) => maps.scenes.get(id)).filter(Boolean),
        prop_ids: item.prop_ids.map((id) => maps.props.get(id)).filter(Boolean),
        project_asset_ids: item.project_asset_ids.map((id) => maps.projectAssets.get(id)).filter(Boolean),
      })));
      (episode.storyboards || []).forEach((item, index) => { const target = storyboards[index]; if (target) maps.storyboards.set(item.id, target.id); });
    });
  }

  private async importImages(extractedRoot: string, projectId: number, rows: Array<Record<string, unknown>>, maps: ImportMaps): Promise<void> {
    for (const row of rows) {
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        INSERT INTO image_generations (
          drama_id, library_item_id, project_asset_id, storyboard_id, scene_id, character_id, prop_id, provider, prompt, model, size, aspect_ratio,
          reference_images, source_url, status, task_id, error_msg, failure_stage, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.library_item_id && !row.project_asset_id && !row.storyboard_id ? null : projectId,
        mappedId(row.library_item_id, maps.libraryItems), mappedId(row.project_asset_id, maps.projectAssets),
        mappedId(row.storyboard_id, maps.storyboards), mappedId(row.scene_id, maps.scenes),
        mappedId(row.character_id, maps.characters), mappedId(row.prop_id, maps.props),
        textOrNull(row.provider), String(row.prompt ?? ''), textOrNull(row.model), textOrNull(row.size), textOrNull(row.aspect_ratio),
        remapReferences(row.reference_images, maps.urls), textOrNull(row.source_url) ?? textOrNull(row.image_url),
        String(row.status ?? 'failed'), textOrNull(row.task_id), textOrNull(row.error_msg), textOrNull(row.failure_stage),
        textOrNull(row.created_at) ?? now, now, textOrNull(row.completed_at),
      );
      const newId = Number(result.lastInsertRowid);
      const oldId = readNumber(row.id);
      if (oldId) maps.images.set(oldId, newId);
      if (row.status !== 'completed') continue;
      const oldPath = requiredArchivePath(row.local_path, '图片');
      const mediaFile = requiredMediaFile(extractedRoot, oldPath);
      const archived = await this.mediaArchive.importFile({ projectId, generationId: newId, kind: 'image', sourcePath: mediaFile });
      this.db.prepare(`UPDATE image_generations SET image_url = ?, local_path = ?, media_type = ?, file_size = ?, updated_at = ? WHERE id = ?`)
        .run(archived.publicUrl, archived.relativePath, archived.mediaType, archived.fileSize, now, newId);
      const oldUrl = readString(row.image_url);
      if (oldUrl) maps.urls.set(oldUrl, archived.publicUrl);
    }
  }

  private async importVideos(extractedRoot: string, projectId: number, rows: Array<Record<string, unknown>>, maps: ImportMaps): Promise<void> {
    for (const row of rows) {
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        INSERT INTO video_generations (
          drama_id, episode_id, storyboard_id, provider, prompt, model, duration, aspect_ratio, resolution, image_url,
          first_frame_url, last_frame_url, reference_image_urls, source_url, status, task_id, provider_task_id,
          error_msg, failure_stage, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId, mappedId(row.episode_id, maps.episodes), mappedId(row.storyboard_id, maps.storyboards), textOrNull(row.provider), String(row.prompt ?? ''), textOrNull(row.model),
        readNumber(row.duration) ?? null, textOrNull(row.aspect_ratio), textOrNull(row.resolution), remapUrl(row.image_url, maps.urls),
        remapUrl(row.first_frame_url, maps.urls), remapUrl(row.last_frame_url, maps.urls), remapReferences(row.reference_image_urls, maps.urls),
        textOrNull(row.source_url) ?? textOrNull(row.video_url), String(row.status ?? 'failed'), textOrNull(row.task_id),
        textOrNull(row.provider_task_id), textOrNull(row.error_msg), textOrNull(row.failure_stage), textOrNull(row.created_at) ?? now, now, textOrNull(row.completed_at),
      );
      const newId = Number(result.lastInsertRowid);
      const oldId = readNumber(row.id);
      if (oldId) maps.videos.set(oldId, newId);
      if (row.status !== 'completed') continue;
      const oldPath = requiredArchivePath(row.local_path, '视频');
      const mediaFile = requiredMediaFile(extractedRoot, oldPath);
      const archived = await this.mediaArchive.importFile({ projectId, generationId: newId, kind: 'video', sourcePath: mediaFile });
      this.db.prepare(`UPDATE video_generations SET video_url = ?, local_path = ?, media_type = ?, file_size = ?, updated_at = ? WHERE id = ?`)
        .run(archived.publicUrl, archived.relativePath, archived.mediaType, archived.fileSize, now, newId);
      const oldUrl = readString(row.video_url);
      if (oldUrl) maps.urls.set(oldUrl, archived.publicUrl);
    }
  }

  private applyCurrentVersions(source: Drama, libraryItems: AssetLibraryItemRow[], maps: ImportMaps): void {
    for (const item of source.characters || []) updateImagePointer(this.db, 'characters', maps.characters.get(item.id), maps.images.get(item.current_image_generation_id ?? 0));
    for (const item of source.scenes || []) updateImagePointer(this.db, 'scenes', maps.scenes.get(item.id), maps.images.get(item.current_image_generation_id ?? 0));
    for (const item of source.props || []) updateImagePointer(this.db, 'props', maps.props.get(item.id), maps.images.get(item.current_image_generation_id ?? 0));
    for (const item of libraryItems) {
      updateImagePointer(this.db, 'asset_library_items', maps.libraryItems.get(item.id), maps.images.get(item.current_image_generation_id ?? 0));
    }
    for (const item of source.project_assets || []) {
      const targetId = maps.projectAssets.get(item.id);
      updateImagePointer(this.db, 'project_assets', targetId, maps.images.get(item.current_image_generation_id ?? 0));
      updateLockedImagePointer(this.db, targetId, maps.images.get(item.locked_image_generation_id ?? 0));
    }
    for (const episode of source.episodes || []) for (const item of episode.storyboards || []) {
      updateImagePointer(this.db, 'storyboards', maps.storyboards.get(item.id), maps.images.get(item.current_image_generation_id ?? 0));
      updateVideoPointer(this.db, maps.storyboards.get(item.id), maps.videos.get(item.current_video_generation_id ?? 0));
    }
    for (const episode of source.episodes || []) {
      updateEpisodeVideoPointer(this.db, maps.episodes.get(episode.id), maps.videos.get(episode.current_video_generation_id ?? 0));
    }
  }
}

function parsePayload(text: string): ArchivePayload {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new ValidationError('项目归档 JSON 无法解析'); }
  const payload = asRecord(value);
  if (payload?.format !== 3 || !asRecord(payload.project) || !Array.isArray(payload.asset_library_items) || !Array.isArray(payload.image_generations) || !Array.isArray(payload.video_generations)) {
    throw new ValidationError('项目归档格式无效或版本不受支持');
  }
  return payload as unknown as ArchivePayload;
}

function updateImagePointer(db: SQLiteDatabase, table: string, targetId: number | undefined, generationId: number | undefined): void {
  if (!targetId || !generationId) return;
  const row = db.prepare('SELECT image_url, local_path FROM image_generations WHERE id = ? AND status = ?').get(generationId, 'completed') as { image_url: string; local_path: string } | undefined;
  if (!row) return;
  if (table === 'storyboards') db.prepare('UPDATE storyboards SET image_url = ?, current_image_generation_id = ? WHERE id = ?').run(row.image_url, generationId, targetId);
  else db.prepare(`UPDATE ${table} SET image_url = ?, local_path = ?, current_image_generation_id = ? WHERE id = ?`).run(row.image_url, row.local_path, generationId, targetId);
}

function updateLockedImagePointer(db: SQLiteDatabase, targetId: number | undefined, generationId: number | undefined): void {
  if (!targetId || !generationId) return;
  const completed = db.prepare("SELECT id FROM image_generations WHERE id = ? AND status = 'completed'").get(generationId);
  if (completed) db.prepare('UPDATE project_assets SET locked_image_generation_id = ? WHERE id = ?').run(generationId, targetId);
}

function updateVideoPointer(db: SQLiteDatabase, storyboardId: number | undefined, generationId: number | undefined): void {
  if (!storyboardId || !generationId) return;
  const row = db.prepare('SELECT video_url FROM video_generations WHERE id = ? AND status = ?').get(generationId, 'completed') as { video_url: string } | undefined;
  if (row) db.prepare('UPDATE storyboards SET video_url = ?, current_video_generation_id = ? WHERE id = ?').run(row.video_url, generationId, storyboardId);
}

function updateEpisodeVideoPointer(db: SQLiteDatabase, episodeId: number | undefined, generationId: number | undefined): void {
  if (!episodeId || !generationId) return;
  const row = db.prepare('SELECT video_url FROM video_generations WHERE id = ? AND status = ?').get(generationId, 'completed') as { video_url: string } | undefined;
  if (row) db.prepare('UPDATE episodes SET video_url = ?, current_video_generation_id = ? WHERE id = ?').run(row.video_url, generationId, episodeId);
}

function rowsByIds<T>(db: SQLiteDatabase, table: 'asset_library_items' | 'image_generations', ids: number[]): T[] {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  return db.prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders}) ORDER BY id`).all(...uniqueIds) as T[];
}

function mappedId(value: unknown, map: Map<number, number>): number | null {
  const id = readNumber(value);
  return id ? map.get(id) ?? null : null;
}

function remapUrl(value: unknown, urls: Map<string, string>): string | null {
  const text = readString(value);
  return text ? urls.get(text) ?? text : null;
}

function remapReferences(value: unknown, urls: Map<string, string>): string {
  if (typeof value !== 'string') return '[]';
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(Array.isArray(parsed) ? parsed.map((item) => remapUrl(item, urls)).filter(Boolean) : []);
  } catch { return '[]'; }
}

function requiredArchivePath(value: unknown, label: string): string {
  const relative = readString(value);
  if (!relative) throw new ValidationError(`已完成${label}缺少本地路径`);
  return normalizeRelative(relative);
}

function requiredMediaFile(extractedRoot: string, relativePath: string): string {
  const target = path.resolve(extractedRoot, 'media', ...relativePath.split('/'));
  if (!inside(extractedRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new ValidationError(`归档缺少媒体文件：${relativePath}`);
  }
  return target;
}

function normalizeRelative(value: string): string {
  const normalized = value.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
  if (!normalized || normalized.split('/').some((segment) => segment === '..' || segment === '.')) throw new ValidationError('归档媒体路径无效');
  return normalized;
}

function textOrNull(value: unknown): string | null {
  return readString(value) ?? null;
}

async function extractArchive(archivePath: string): Promise<string> {
  const extractedRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tomato-ai-drama-import-'));
  try {
    const directory = await unzipper.Open.file(archivePath);
    for (const entry of directory.files) {
      const relativePath = safeEntryPath(entry.path);
      const destination = path.resolve(extractedRoot, ...relativePath.split('/'));
      if (!inside(extractedRoot, destination)) throw new ValidationError('项目归档包含越界路径');
      if (entry.type === 'Directory') {
        await fs.promises.mkdir(destination, { recursive: true });
        continue;
      }
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await pipeline(entry.stream(), fs.createWriteStream(destination, { flags: 'wx' }));
    }
    return extractedRoot;
  } catch (error) {
    await fs.promises.rm(extractedRoot, { recursive: true, force: true });
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('项目归档无法读取或包含损坏文件', { cause: error });
  }
}

function safeEntryPath(value: string): string {
  const normalized = value.replace(/\\/gu, '/').replace(/\/$/u, '');
  if (
    !normalized
    || normalized.startsWith('/')
    || /^[a-z]:/iu.test(normalized)
    || normalized.includes('\0')
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) throw new ValidationError('项目归档包含无效路径');
  return normalized;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}
