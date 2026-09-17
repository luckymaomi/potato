import type { JsonObject } from '../types/core';
import { asRecord, parseJson, readNumber, readString } from '../types/core';
import type {
  CharacterRow,
  Drama,
  DramaRow,
  EpisodeRow,
  PropRow,
  SceneRow,
  StoryboardRow,
} from '../types/domain';
import type { SQLiteDatabase } from '../types/core';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

export interface DramaListInput { page: number; pageSize: number; keyword?: string }

export class ProjectService {
  constructor(private readonly db: SQLiteDatabase) {}

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
      storyboards: storyboardStatement.all(episode.id) as StoryboardRow[],
    }));
    drama.characters = this.db.prepare('SELECT * FROM characters WHERE drama_id = ? ORDER BY id').all(id) as CharacterRow[];
    drama.scenes = this.db.prepare('SELECT * FROM scenes WHERE drama_id = ? ORDER BY id').all(id) as SceneRow[];
    drama.props = this.db.prepare('SELECT * FROM props WHERE drama_id = ? ORDER BY id').all(id) as PropRow[];
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
    return this.require(createProject());
  }

  update(id: number, input: unknown): Drama {
    const current = this.require(id);
    const body = asRecord(input) ?? {};
    const metadata = body.metadata === undefined
      ? current.metadata
      : preserveCanvasMetadata(jsonObject(body.metadata), current.metadata);
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
    return this.require(id);
  }

  remove(id: number): boolean {
    return this.db.prepare('DELETE FROM dramas WHERE id = ?').run(id).changes > 0;
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
    return this.db.prepare('SELECT * FROM episodes WHERE drama_id = ? ORDER BY episode_number').all(dramaId) as EpisodeRow[];
  }

  saveCanvas(
    dramaId: number,
    canvasLayout: unknown,
    expectedRevision: unknown,
  ): Drama {
    const revision = readNumber(expectedRevision);
    if (revision === undefined || !Number.isInteger(revision) || revision < 0) {
      throw new ValidationError('保存画布时必须提供有效的 expected_revision');
    }
    const layout = asRecord(canvasLayout);
    if (
      !layout
      || !Array.isArray(layout.workspace_nodes)
      || !Array.isArray(layout.edges)
      || !Array.isArray(layout.workflow_groups)
    ) {
      throw new ValidationError('canvas_layout 必须包含 workspace_nodes、edges 和 workflow_groups 数组');
    }

    const save = this.db.transaction(() => {
      const row = this.db.prepare('SELECT metadata, canvas_revision FROM dramas WHERE id = ?')
        .get(dramaId) as Pick<DramaRow, 'metadata' | 'canvas_revision'> | undefined;
      if (!row) throw new NotFoundError('项目不存在');
      if (row.canvas_revision !== revision) {
        throw new ConflictError(`画布已被其他页面更新，当前版本为 ${row.canvas_revision}，请重新加载后再编辑`);
      }

      const metadata = parseJson<JsonObject>(row.metadata, {});
      metadata.canvas_layout = toJsonValue(layout);
      const result = this.db.prepare(`
        UPDATE dramas
        SET metadata = ?, canvas_revision = canvas_revision + 1, updated_at = ?
        WHERE id = ? AND canvas_revision = ?
      `).run(JSON.stringify(metadata), new Date().toISOString(), dramaId, revision);
      if (result.changes !== 1) {
        const actual = this.db.prepare('SELECT canvas_revision FROM dramas WHERE id = ?')
          .get(dramaId) as Pick<DramaRow, 'canvas_revision'> | undefined;
        throw new ConflictError(`画布已被其他页面更新，当前版本为 ${actual?.canvas_revision ?? '未知'}，请重新加载后再编辑`);
      }
    });
    save();
    return this.require(dramaId);
  }

  require(id: number): Drama {
    const project = this.get(id);
    if (!project) throw new NotFoundError('项目不存在');
    return project;
  }

  private touch(id: number): void {
    this.db.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }
}

function normalizeDrama(row: DramaRow): Drama {
  return { ...row, metadata: parseJson<JsonObject>(row.metadata, {}) };
}

function jsonObject(value: unknown): JsonObject {
  const object = asRecord(value);
  return object ? JSON.parse(JSON.stringify(object)) as JsonObject : {};
}

function preserveCanvasMetadata(next: JsonObject, current: JsonObject): JsonObject {
  const metadata = { ...next };
  if (current.canvas_layout !== undefined) metadata.canvas_layout = current.canvas_layout;
  return metadata;
}

function toJsonValue(value: unknown): import('../types/core').JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as import('../types/core').JsonValue;
}
