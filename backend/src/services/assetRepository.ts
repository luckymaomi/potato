import { NotFoundError, ValidationError } from '../errors';
import type { Logger, SQLiteDatabase } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import type { CharacterRow, EpisodeRow, PropRow, SceneRow, StoryboardRow } from '../types/domain';

export class AssetRepository {
  constructor(private readonly db: SQLiteDatabase, private readonly log?: Logger) {}

  getCharacter(id: number): CharacterRow | undefined {
    return this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
  }

  getScene(id: number): SceneRow | undefined {
    return this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as SceneRow | undefined;
  }

  getProp(id: number): PropRow | undefined {
    return this.db.prepare('SELECT * FROM props WHERE id = ?').get(id) as PropRow | undefined;
  }

  getStoryboard(id: number): StoryboardRow | undefined {
    const row = this.db.prepare('SELECT * FROM storyboards WHERE id = ?').get(id) as StoryboardRow | undefined;
    return row ? this.hydrateStoryboard(row) : undefined;
  }

  listStoryboards(episodeId: number): StoryboardRow[] {
    const rows = this.db.prepare('SELECT * FROM storyboards WHERE episode_id = ? ORDER BY storyboard_number').all(episodeId) as StoryboardRow[];
    return rows.map((row) => this.hydrateStoryboard(row));
  }

  episode(id: number): EpisodeRow | undefined {
    return this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as EpisodeRow | undefined;
  }

  updateCharacter(id: number, input: unknown): CharacterRow {
    const current = this.getCharacter(id);
    if (!current) throw new NotFoundError('角色不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE characters SET name = ?, description = ?, appearance = ?, updated_at = ? WHERE id = ?
    `).run(
      readString(body.name) ?? current.name,
      nullable(body, 'description', current.description),
      nullable(body, 'appearance', current.appearance),
      new Date().toISOString(),
      id,
    );
    const updated = this.getCharacter(id) as CharacterRow;
    this.log?.audit?.('asset.character.updated', { id, record: updated });
    return updated;
  }

  updateScene(id: number, input: unknown): SceneRow {
    const current = this.getScene(id);
    if (!current) throw new NotFoundError('场景不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare('UPDATE scenes SET location = ?, prompt = ?, updated_at = ? WHERE id = ?').run(
      readString(body.location) ?? current.location,
      nullable(body, 'prompt', current.prompt),
      new Date().toISOString(),
      id,
    );
    const updated = this.getScene(id) as SceneRow;
    this.log?.audit?.('asset.scene.updated', { id, record: updated });
    return updated;
  }

  updateProp(id: number, input: unknown): PropRow {
    const current = this.getProp(id);
    if (!current) throw new NotFoundError('道具不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare('UPDATE props SET name = ?, description = ?, prompt = ?, updated_at = ? WHERE id = ?').run(
      readString(body.name) ?? current.name,
      nullable(body, 'description', current.description),
      nullable(body, 'prompt', current.prompt),
      new Date().toISOString(),
      id,
    );
    const updated = this.getProp(id) as PropRow;
    this.log?.audit?.('asset.prop.updated', { id, record: updated });
    return updated;
  }

  syncCharacters(projectId: number, values: unknown[]): CharacterRow[] {
    const save = this.db.transaction(() => values.map((raw) => {
      const item = asRecord(raw) ?? {};
      const name = readString(item.name) ?? '未命名角色';
      const existing = this.characters(projectId).find((row) => sameKey(row.name, name));
      if (existing) {
        this.db.prepare('UPDATE characters SET name = ?, description = ?, appearance = ?, updated_at = ? WHERE id = ?').run(
          name,
          readString(item.description) ?? existing.description,
          readString(item.appearance) ?? existing.appearance,
          new Date().toISOString(),
          existing.id,
        );
        return this.getCharacter(existing.id) as CharacterRow;
      }
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        INSERT INTO characters (drama_id, name, description, appearance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId, name, readString(item.description) ?? null, readString(item.appearance) ?? null, now, now);
      return this.getCharacter(Number(result.lastInsertRowid)) as CharacterRow;
    }));
    const records = save();
    this.log?.audit?.('asset.characters.synchronized', { projectId, records });
    return records;
  }

  syncScenes(projectId: number, values: unknown[]): SceneRow[] {
    const save = this.db.transaction(() => values.map((raw) => {
      const item = asRecord(raw) ?? {};
      const location = readString(item.location) ?? '未命名场景';
      const existing = this.scenes(projectId).find((row) => sameKey(row.location, location));
      const prompt = readString(item.prompt) ?? readString(item.description);
      if (existing) {
        this.db.prepare('UPDATE scenes SET location = ?, prompt = ?, updated_at = ? WHERE id = ?').run(
          location, prompt ?? existing.prompt, new Date().toISOString(), existing.id,
        );
        return this.getScene(existing.id) as SceneRow;
      }
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        INSERT INTO scenes (drama_id, location, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      `).run(projectId, location, prompt ?? null, now, now);
      return this.getScene(Number(result.lastInsertRowid)) as SceneRow;
    }));
    const records = save();
    this.log?.audit?.('asset.scenes.synchronized', { projectId, records });
    return records;
  }

  syncProps(projectId: number, values: unknown[]): PropRow[] {
    const save = this.db.transaction(() => values.map((raw) => {
      const item = asRecord(raw) ?? {};
      const name = readString(item.name) ?? '未命名道具';
      const existing = this.props(projectId).find((row) => sameKey(row.name, name));
      if (existing) {
        this.db.prepare('UPDATE props SET name = ?, description = ?, prompt = ?, updated_at = ? WHERE id = ?').run(
          name,
          readString(item.description) ?? existing.description,
          readString(item.prompt) ?? existing.prompt,
          new Date().toISOString(),
          existing.id,
        );
        return this.getProp(existing.id) as PropRow;
      }
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        INSERT INTO props (drama_id, name, description, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId, name, readString(item.description) ?? null, readString(item.prompt) ?? null, now, now);
      return this.getProp(Number(result.lastInsertRowid)) as PropRow;
    }));
    const records = save();
    this.log?.audit?.('asset.props.synchronized', { projectId, records });
    return records;
  }

  createStoryboard(input: unknown): StoryboardRow {
    const body = asRecord(input) ?? {};
    const episodeId = readNumber(body.episode_id);
    if (!episodeId) throw new ValidationError('关联集数 ID 无效');
    const episode = this.episode(episodeId);
    if (!episode) throw new NotFoundError('关联集数不存在');
    const number = readNumber(body.storyboard_number) ?? this.listStoryboards(episodeId).length + 1;
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO storyboards (
        episode_id, storyboard_number, title, description, action, dialogue,
        image_prompt, video_prompt, duration, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      episodeId, number, value(body.title), value(body.description), value(body.action), value(body.dialogue),
      value(body.image_prompt), value(body.video_prompt), readNumber(body.duration) ?? null, now, now,
    );
    const id = Number(result.lastInsertRowid);
    this.syncStoryboardLinks(id, episode.drama_id, body);
    const created = this.getStoryboard(id) as StoryboardRow;
    this.log?.audit?.('storyboard.created', { storyboard: created });
    return created;
  }

  updateStoryboard(id: number, input: unknown): StoryboardRow {
    const current = this.getStoryboard(id);
    if (!current) throw new NotFoundError('分镜不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE storyboards SET storyboard_number = ?, title = ?, description = ?, action = ?, dialogue = ?,
        image_prompt = ?, video_prompt = ?, duration = ?, updated_at = ? WHERE id = ?
    `).run(
      readNumber(body.storyboard_number) ?? current.storyboard_number,
      optional(body, 'title', current.title), optional(body, 'description', current.description),
      optional(body, 'action', current.action), optional(body, 'dialogue', current.dialogue),
      optional(body, 'image_prompt', current.image_prompt), optional(body, 'video_prompt', current.video_prompt),
      body.duration === undefined ? current.duration : readNumber(body.duration) ?? null,
      new Date().toISOString(), id,
    );
    const episode = this.episode(current.episode_id) as EpisodeRow;
    if (hasLinkFields(body)) this.syncStoryboardLinks(id, episode.drama_id, body);
    const updated = this.getStoryboard(id) as StoryboardRow;
    this.log?.audit?.('storyboard.updated', { storyboard: updated });
    return updated;
  }

  syncStoryboards(episodeId: number, values: unknown[]): StoryboardRow[] {
    const episode = this.episode(episodeId);
    if (!episode) throw new NotFoundError('集数不存在');
    const save = this.db.transaction(() => {
      values.forEach((raw, index) => {
        const body = { ...(asRecord(raw) ?? {}), storyboard_number: index + 1 };
        const existing = this.db.prepare('SELECT id FROM storyboards WHERE episode_id = ? AND storyboard_number = ?')
          .get(episodeId, index + 1) as { id: number } | undefined;
        if (existing) this.updateStoryboard(existing.id, body);
        else this.createStoryboard({ ...body, episode_id: episodeId });
      });
      this.db.prepare('DELETE FROM storyboards WHERE episode_id = ? AND storyboard_number > ?').run(episodeId, values.length);
    });
    save();
    const storyboards = this.listStoryboards(episodeId);
    this.log?.audit?.('storyboards.synchronized', { episodeId, storyboards });
    return storyboards;
  }

  private characters(projectId: number): CharacterRow[] {
    return this.db.prepare('SELECT * FROM characters WHERE drama_id = ? ORDER BY id').all(projectId) as CharacterRow[];
  }

  private scenes(projectId: number): SceneRow[] {
    return this.db.prepare('SELECT * FROM scenes WHERE drama_id = ? ORDER BY id').all(projectId) as SceneRow[];
  }

  private props(projectId: number): PropRow[] {
    return this.db.prepare('SELECT * FROM props WHERE drama_id = ? ORDER BY id').all(projectId) as PropRow[];
  }

  private hydrateStoryboard(row: StoryboardRow): StoryboardRow {
    return {
      ...row,
      character_ids: ids(this.db, 'storyboard_characters', 'character_id', row.id),
      scene_ids: ids(this.db, 'storyboard_scenes', 'scene_id', row.id),
      prop_ids: ids(this.db, 'storyboard_props', 'prop_id', row.id),
    };
  }

  private syncStoryboardLinks(storyboardId: number, projectId: number, body: Record<string, unknown>): void {
    const characters = resolveIds(body.character_ids, names(body.characters ?? body.character_names), this.characters(projectId), 'name');
    const scenes = resolveIds(body.scene_ids, names(body.scenes ?? body.scene_names), this.scenes(projectId), 'location');
    const props = resolveIds(body.prop_ids, names(body.props ?? body.prop_names), this.props(projectId), 'name');
    for (const [table, column, values] of [
      ['storyboard_characters', 'character_id', characters],
      ['storyboard_scenes', 'scene_id', scenes],
      ['storyboard_props', 'prop_id', props],
    ] as const) {
      this.db.prepare(`DELETE FROM ${table} WHERE storyboard_id = ?`).run(storyboardId);
      const insert = this.db.prepare(`INSERT INTO ${table} (storyboard_id, ${column}) VALUES (?, ?)`);
      values.forEach((id) => insert.run(storyboardId, id));
    }
  }

}

function ids(db: SQLiteDatabase, table: string, column: string, storyboardId: number): number[] {
  return (db.prepare(`SELECT ${column} AS id FROM ${table} WHERE storyboard_id = ? ORDER BY ${column}`).all(storyboardId) as Array<{ id: number }>).map((item) => item.id);
}

function resolveIds<T extends { id: number }>(rawIds: unknown, requestedNames: string[], rows: T[], key: keyof T): number[] {
  const valid = new Set(rows.map((row) => row.id));
  const explicit = Array.isArray(rawIds)
    ? rawIds.map(readNumber).filter((id): id is number => Boolean(id && valid.has(id)))
    : [];
  if (explicit.length) return [...new Set(explicit)];
  return requestedNames.flatMap((name) => {
    const row = rows.find((item) => sameKey(String(item[key]), name));
    return row ? [row.id] : [];
  });
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    const record = asRecord(item);
    const name = readString(record?.name) ?? readString(record?.location);
    return name ? [name] : [];
  });
}

function sameKey(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function value(input: unknown): string | null {
  return readString(input) ?? null;
}

function nullable(body: Record<string, unknown>, key: string, current: string | null): string | null {
  return body[key] === undefined ? current : readString(body[key]) ?? null;
}

function optional(body: Record<string, unknown>, key: string, current: string | null): string | null {
  return body[key] === undefined ? current : value(body[key]);
}

function hasLinkFields(body: Record<string, unknown>): boolean {
  return ['character_ids', 'scene_ids', 'prop_ids', 'characters', 'character_names', 'scenes', 'scene_names', 'props', 'prop_names']
    .some((key) => Object.prototype.hasOwnProperty.call(body, key));
}
