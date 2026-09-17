import type { SQLiteDatabase } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import type { EpisodeRow, StoryboardRow } from '../types/domain';
import { NotFoundError, ValidationError } from '../errors';

export class StoryboardService {
  constructor(private readonly db: SQLiteDatabase) {}

  get(id: number): StoryboardRow | undefined {
    return this.db.prepare('SELECT * FROM storyboards WHERE id = ?').get(id) as StoryboardRow | undefined;
  }

  list(episodeId: number): StoryboardRow[] {
    return this.db.prepare('SELECT * FROM storyboards WHERE episode_id = ? ORDER BY storyboard_number').all(episodeId) as StoryboardRow[];
  }

  episode(id: number): EpisodeRow | undefined {
    return this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as EpisodeRow | undefined;
  }

  create(input: unknown): StoryboardRow {
    const body = asRecord(input) ?? {};
    const episodeId = readNumber(body.episode_id);
    if (!episodeId) throw new ValidationError('关联集数 ID 无效');
    if (!this.episode(episodeId)) throw new NotFoundError('关联集数不存在');
    const number = readNumber(body.storyboard_number) ?? this.list(episodeId).length + 1;
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO storyboards (
        episode_id, storyboard_number, title, description, action, dialogue,
        image_prompt, video_prompt, image_url, video_url, duration, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      episodeId,
      number,
      value(body.title),
      value(body.description),
      value(body.action),
      value(body.dialogue),
      value(body.image_prompt),
      value(body.video_prompt),
      value(body.image_url),
      value(body.video_url),
      readNumber(body.duration) ?? null,
      now,
      now,
    );
    return this.get(Number(result.lastInsertRowid)) as StoryboardRow;
  }

  update(id: number, input: unknown): StoryboardRow {
    const current = this.get(id);
    if (!current) throw new NotFoundError('分镜不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE storyboards SET storyboard_number = ?, title = ?, description = ?, action = ?, dialogue = ?,
        image_prompt = ?, video_prompt = ?, image_url = ?, video_url = ?, duration = ?, updated_at = ? WHERE id = ?
    `).run(
      readNumber(body.storyboard_number) ?? current.storyboard_number,
      optional(body, 'title', current.title),
      optional(body, 'description', current.description),
      optional(body, 'action', current.action),
      optional(body, 'dialogue', current.dialogue),
      optional(body, 'image_prompt', current.image_prompt),
      optional(body, 'video_prompt', current.video_prompt),
      optional(body, 'image_url', current.image_url),
      optional(body, 'video_url', current.video_url),
      body.duration === undefined ? current.duration : readNumber(body.duration) ?? null,
      new Date().toISOString(),
      id,
    );
    return this.get(id) as StoryboardRow;
  }

  replace(episodeId: number, values: unknown[]): StoryboardRow[] {
    if (!this.episode(episodeId)) throw new NotFoundError('集数不存在');
    const save = this.db.transaction(() => {
      this.db.prepare('DELETE FROM storyboards WHERE episode_id = ?').run(episodeId);
      values.forEach((item, index) => this.create({ ...asRecord(item), episode_id: episodeId, storyboard_number: index + 1 }));
    });
    save();
    return this.list(episodeId);
  }
}

function value(input: unknown): string | null {
  return readString(input) ?? null;
}

function optional(body: Record<string, unknown>, key: string, current: string | null): string | null {
  return body[key] === undefined ? current : value(body[key]);
}
