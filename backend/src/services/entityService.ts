import type { SQLiteDatabase } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import type { CharacterRow, PropRow, SceneRow } from '../types/domain';
import { NotFoundError } from '../errors';

export class EntityService {
  constructor(private readonly db: SQLiteDatabase) {}

  getCharacter(id: number): CharacterRow | undefined {
    return this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
  }

  getScene(id: number): SceneRow | undefined {
    return this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as SceneRow | undefined;
  }

  getProp(id: number): PropRow | undefined {
    return this.db.prepare('SELECT * FROM props WHERE id = ?').get(id) as PropRow | undefined;
  }

  updateCharacter(id: number, input: unknown): CharacterRow {
    const current = this.getCharacter(id);
    if (!current) throw new NotFoundError('角色不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE characters SET name = ?, description = ?, appearance = ?, image_url = ?, local_path = ?, updated_at = ? WHERE id = ?
    `).run(
      readString(body.name) ?? current.name,
      nullable(body, 'description', current.description),
      nullable(body, 'appearance', current.appearance),
      nullable(body, 'image_url', current.image_url),
      nullable(body, 'local_path', current.local_path),
      new Date().toISOString(),
      id,
    );
    return this.getCharacter(id) as CharacterRow;
  }

  updateScene(id: number, input: unknown): SceneRow {
    const current = this.getScene(id);
    if (!current) throw new NotFoundError('场景不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE scenes SET location = ?, prompt = ?, image_url = ?, local_path = ?, episode_id = ?, updated_at = ? WHERE id = ?
    `).run(
      readString(body.location) ?? current.location,
      nullable(body, 'prompt', current.prompt),
      nullable(body, 'image_url', current.image_url),
      nullable(body, 'local_path', current.local_path),
      body.episode_id === undefined ? current.episode_id : readNumber(body.episode_id) ?? null,
      new Date().toISOString(),
      id,
    );
    return this.getScene(id) as SceneRow;
  }

  updateProp(id: number, input: unknown): PropRow {
    const current = this.getProp(id);
    if (!current) throw new NotFoundError('道具不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE props SET name = ?, description = ?, prompt = ?, image_url = ?, local_path = ?, episode_id = ?, updated_at = ? WHERE id = ?
    `).run(
      readString(body.name) ?? current.name,
      nullable(body, 'description', current.description),
      nullable(body, 'prompt', current.prompt),
      nullable(body, 'image_url', current.image_url),
      nullable(body, 'local_path', current.local_path),
      body.episode_id === undefined ? current.episode_id : readNumber(body.episode_id) ?? null,
      new Date().toISOString(),
      id,
    );
    return this.getProp(id) as PropRow;
  }

  replaceCharacters(dramaId: number, values: unknown[]): CharacterRow[] {
    const now = new Date().toISOString();
    const insert = this.db.transaction(() => {
      this.db.prepare('DELETE FROM characters WHERE drama_id = ?').run(dramaId);
      for (const raw of values) {
        const item = asRecord(raw) ?? {};
        this.db.prepare(`
          INSERT INTO characters (drama_id, name, description, appearance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          dramaId,
          readString(item.name) ?? '未命名角色',
          readString(item.description) ?? null,
          readString(item.appearance) ?? null,
          now,
          now,
        );
      }
    });
    insert();
    return this.db.prepare('SELECT * FROM characters WHERE drama_id = ? ORDER BY id').all(dramaId) as CharacterRow[];
  }

  replaceScenes(dramaId: number, episodeId: number, values: unknown[]): SceneRow[] {
    const now = new Date().toISOString();
    const insert = this.db.transaction(() => {
      this.db.prepare('DELETE FROM scenes WHERE episode_id = ?').run(episodeId);
      for (const raw of values) {
        const item = asRecord(raw) ?? {};
        this.db.prepare(`
          INSERT INTO scenes (drama_id, episode_id, location, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        `).run(dramaId, episodeId, readString(item.location) ?? '未命名场景', readString(item.prompt) ?? readString(item.description) ?? null, now, now);
      }
    });
    insert();
    return this.db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY id').all(episodeId) as SceneRow[];
  }

  replaceProps(dramaId: number, episodeId: number, values: unknown[]): PropRow[] {
    const now = new Date().toISOString();
    const insert = this.db.transaction(() => {
      this.db.prepare('DELETE FROM props WHERE episode_id = ?').run(episodeId);
      for (const raw of values) {
        const item = asRecord(raw) ?? {};
        this.db.prepare(`
          INSERT INTO props (drama_id, episode_id, name, description, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          dramaId,
          episodeId,
          readString(item.name) ?? '未命名道具',
          readString(item.description) ?? null,
          readString(item.prompt) ?? null,
          now,
          now,
        );
      }
    });
    insert();
    return this.db.prepare('SELECT * FROM props WHERE episode_id = ? ORDER BY id').all(episodeId) as PropRow[];
  }
}

function nullable(body: Record<string, unknown>, key: string, current: string | null): string | null {
  return body[key] === undefined ? current : readString(body[key]) ?? null;
}
