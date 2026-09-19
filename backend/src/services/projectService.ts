import type { JsonObject, Logger } from '../types/core';
import { asRecord, parseJson, readNumber, readString } from '../types/core';
import type {
  CharacterRow,
  Drama,
  DramaRow,
  EpisodeRow,
  PropRow,
  SceneRow,
  StoryboardRow,
  MediaLifecycleState,
  ProjectAssetRow,
} from '../types/domain';
import type { SQLiteDatabase } from '../types/core';
import { NotFoundError, ValidationError } from '../errors';
import { MediaArchiveService } from './mediaArchiveService';
import { assetTagsFromMetadata } from './assetRepository';

export interface DramaListInput { page: number; pageSize: number; keyword?: string }

export class ProjectService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly mediaArchive: MediaArchiveService,
    private readonly log?: Logger,
  ) {}

  list(input: DramaListInput): { items: Drama[]; total: number } {
    const pattern = `%${input.keyword ?? ''}%`;
    const where = input.keyword ? 'WHERE title LIKE ? OR description LIKE ?' : '';
    const params = input.keyword ? [pattern, pattern] : [];
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS total FROM dramas ${where}`).get(...params) as { total: number };
    const rows = this.db.prepare(`
      SELECT * FROM dramas ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(...params, input.pageSize, (input.page - 1) * input.pageSize) as DramaRow[];
    return { items: rows.map(normalizeDrama), total: totalRow.total };
  }

  get(id: number): Drama | undefined {
    const row = this.db.prepare('SELECT * FROM dramas WHERE id = ?').get(id) as DramaRow | undefined;
    if (!row) return undefined;
    const drama = normalizeDrama(row);
    const episodes = this.db.prepare('SELECT * FROM episodes WHERE drama_id = ? ORDER BY episode_number').all(id) as EpisodeRow[];
    const storyboardStatement = this.db.prepare('SELECT * FROM storyboards WHERE episode_id = ? ORDER BY storyboard_number');
    drama.episodes = episodes.map((episode) => ({
      ...episode,
      storyboards: (storyboardStatement.all(episode.id) as StoryboardRow[]).map((storyboard) => ({
        ...storyboard,
        character_ids: relationIds(this.db, 'storyboard_characters', 'character_id', storyboard.id),
        scene_ids: relationIds(this.db, 'storyboard_scenes', 'scene_id', storyboard.id),
        prop_ids: relationIds(this.db, 'storyboard_props', 'prop_id', storyboard.id),
        project_asset_ids: relationIds(this.db, 'storyboard_project_assets', 'project_asset_id', storyboard.id),
      })),
    }));
    drama.characters = this.db.prepare('SELECT * FROM characters WHERE drama_id = ? ORDER BY id').all(id) as CharacterRow[];
    drama.scenes = this.db.prepare('SELECT * FROM scenes WHERE drama_id = ? ORDER BY id').all(id) as SceneRow[];
    drama.props = this.db.prepare('SELECT * FROM props WHERE drama_id = ? ORDER BY id').all(id) as PropRow[];
    drama.project_assets = (this.db.prepare('SELECT * FROM project_assets WHERE drama_id = ? ORDER BY id').all(id) as ProjectAssetRow[])
      .map((asset) => ({
        ...asset,
        tags: assetTagsFromMetadata(asset.metadata),
      }));
    drama.media_lifecycle = {
      images: this.mediaLifecycle('image_generations', 'image_url', id),
      videos: this.mediaLifecycle('video_generations', 'video_url', id),
    };
    return drama;
  }

  create(input: unknown): Drama {
    const body = asRecord(input) ?? {};
    const title = readString(body.title);
    if (!title) throw new ValidationError('项目名称不能为空');
    const now = new Date().toISOString();
    const metadata = jsonObject(body.metadata);
    const createProject = this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT INTO dramas (title, description, genre, style, status, thumbnail, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        title,
        readString(body.description) ?? null,
        readString(body.genre) ?? null,
        readString(body.style) ?? 'realistic',
        readString(body.status) ?? 'draft',
        readString(body.thumbnail) ?? null,
        JSON.stringify(metadata),
        now,
        now,
      );
      const projectId = Number(result.lastInsertRowid);
      this.db.prepare(`
        INSERT INTO episodes (drama_id, episode_number, title, duration, script_content, status, created_at, updated_at)
        VALUES (?, 1, '第 1 集', 0, '', 'draft', ?, ?)
      `).run(projectId, now, now);
      return projectId;
    });
    const project = this.require(createProject());
    this.log?.audit?.('project.created', { projectId: project.id, title: project.title, metadata: project.metadata });
    return project;
  }

  update(id: number, input: unknown): Drama {
    const current = this.require(id);
    const body = asRecord(input) ?? {};
    const metadata = body.metadata === undefined ? current.metadata : jsonObject(body.metadata);
    this.db.prepare(`
      UPDATE dramas SET title = ?, description = ?, genre = ?, style = ?, status = ?, thumbnail = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(
      readString(body.title) ?? current.title,
      body.description === undefined ? current.description : readString(body.description) ?? null,
      body.genre === undefined ? current.genre : readString(body.genre) ?? null,
      readString(body.style) ?? current.style,
      readString(body.status) ?? current.status,
      body.thumbnail === undefined ? current.thumbnail : readString(body.thumbnail) ?? null,
      JSON.stringify(metadata),
      new Date().toISOString(),
      id,
    );
    const updated = this.require(id);
    this.log?.audit?.('project.updated', { projectId: id, input: body, title: updated.title });
    return updated;
  }

  remove(id: number): boolean {
    const current = this.get(id);
    const removed = this.db.prepare('DELETE FROM dramas WHERE id = ?').run(id).changes > 0;
    if (removed) this.log?.audit?.('project.deleted', { projectId: id, title: current?.title });
    return removed;
  }

  saveEpisodes(dramaId: number, input: unknown): EpisodeRow[] {
    this.require(dramaId);
    const rows = Array.isArray(input) ? input : [];
    const now = new Date().toISOString();
    const save = this.db.transaction(() => {
      for (const raw of rows) {
        const item = asRecord(raw) ?? {};
        const number = readNumber(item.episode_number);
        if (!number || number < 1) throw new ValidationError('集数必须是大于 0 的数字');
        const title = readString(item.title) ?? `第 ${number} 集`;
        this.db.prepare(`
          INSERT INTO episodes (drama_id, episode_number, title, duration, script_content, description, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(drama_id, episode_number) DO UPDATE SET
            title = excluded.title,
            duration = excluded.duration,
            script_content = excluded.script_content,
            description = excluded.description,
            status = excluded.status,
            updated_at = excluded.updated_at
        `).run(
          dramaId,
          number,
          title,
          readNumber(item.duration) ?? 0,
          readString(item.script_content) ?? '',
          readString(item.description) ?? null,
          readString(item.status) ?? 'draft',
          now,
          now,
        );
      }
    });
    save();
    this.touch(dramaId);
    const episodes = this.db.prepare('SELECT * FROM episodes WHERE drama_id = ? ORDER BY episode_number').all(dramaId) as EpisodeRow[];
    this.log?.audit?.('project.episodes.saved', { projectId: dramaId, episodes });
    return episodes;
  }

  require(id: number): Drama {
    const project = this.get(id);
    if (!project) throw new NotFoundError('项目不存在');
    return project;
  }

  private touch(id: number): void {
    this.db.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  private mediaLifecycle(table: 'image_generations' | 'video_generations', urlColumn: 'image_url' | 'video_url', dramaId: number): Record<string, MediaLifecycleState> {
    const rows = this.db.prepare(`
      SELECT id, status, ${urlColumn} AS url, local_path, failure_stage
      FROM ${table} WHERE drama_id = ? ORDER BY id
    `).all(dramaId) as Array<Omit<MediaLifecycleState, 'generation_id' | 'available'> & { id: number }>;
    return Object.fromEntries(rows.map((row) => [String(row.id), {
      generation_id: row.id,
      status: row.status,
      url: row.url,
      local_path: row.local_path,
      failure_stage: row.failure_stage,
      available: row.status === 'completed'
        && Boolean(row.url?.startsWith('/static/'))
        && this.mediaArchive.isAvailable(row.local_path),
    }]));
  }
}

function normalizeDrama(row: DramaRow): Drama {
  return { ...row, metadata: parseJson<JsonObject>(row.metadata, {}) };
}

function jsonObject(value: unknown): JsonObject {
  const object = asRecord(value);
  return object ? JSON.parse(JSON.stringify(object)) as JsonObject : {};
}

function relationIds(db: SQLiteDatabase, table: string, column: string, storyboardId: number): number[] {
  return (db.prepare(`SELECT ${column} AS id FROM ${table} WHERE storyboard_id = ? ORDER BY ${column}`)
    .all(storyboardId) as Array<{ id: number }>).map((item) => item.id);
}
