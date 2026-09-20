import { NotFoundError, ValidationError } from '../errors';
import type { Logger, SQLiteDatabase } from '../types/core';
import { asRecord, parseJson, readNumber, readString } from '../types/core';
import type { AssetKind, AssetOutputType, AssetTextProfile, EpisodeRow, ProjectAssetRow, StoryboardRow } from '../types/domain';

const PROFILE_FIELDS: Record<AssetKind, readonly string[]> = {
  character: [
    'age', 'gender', 'occupation', 'faction', 'identity_tags',
    'face_shape', 'facial_features', 'hairstyle', 'body_type', 'skin_tone',
    'default_outfit', 'personality', 'common_expressions', 'aura',
    'voice_tone_id', 'speech_rate', 'accent', 'signature_phrase',
  ],
  scene: [
    'location_type', 'layout', 'architectural_style', 'scale',
    'time_of_day', 'light_source', 'color_temperature', 'contrast',
    'key_furniture', 'props', 'decorations', 'vegetation',
    'palette', 'emotion', 'weather',
  ],
  prop: [
    'category', 'size', 'material', 'color', 'shape', 'condition',
    'special_marks', 'unique_design', 'default_state', 'interaction_states', 'bindings',
  ],
};

const OUTPUT_TYPES: Record<AssetKind, readonly AssetOutputType[]> = {
  character: ['character-layout-a', 'character-layout-b', 'character-layout-c', 'character-layout-d'],
  scene: ['scene-panorama', 'scene-detail', 'scene-lighting-variant'],
  prop: ['prop-multi-angle', 'prop-state-variant'],
};

const DEFAULT_OUTPUT_TYPE: Record<AssetKind, AssetOutputType> = {
  character: 'character-layout-a',
  scene: 'scene-panorama',
  prop: 'prop-multi-angle',
};

export class AssetRepository {
  constructor(private readonly db: SQLiteDatabase, private readonly log?: Logger) {}

  listProjectAssets(projectId: number, kind?: AssetKind): ProjectAssetRow[] {
    this.requireProject(projectId);
    const rows = (kind
      ? this.db.prepare('SELECT * FROM project_assets WHERE drama_id = ? AND kind = ? ORDER BY id').all(projectId, kind)
      : this.db.prepare('SELECT * FROM project_assets WHERE drama_id = ? ORDER BY id').all(projectId)) as RawProjectAsset[];
    return rows.map(hydrateProjectAsset);
  }

  getProjectAsset(id: number): ProjectAssetRow | undefined {
    const row = this.db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id) as RawProjectAsset | undefined;
    return row ? hydrateProjectAsset(row) : undefined;
  }

  createProjectAsset(projectId: number, input: unknown): ProjectAssetRow {
    this.requireProject(projectId);
    const body = asRecord(input) ?? {};
    const kind = assetKind(body.kind);
    const name = readString(body.name) ?? `未命名${assetLabel(kind)}`;
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO project_assets (
        drama_id, kind, name, text_profile, output_type, input_reference_images, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      kind,
      name,
      JSON.stringify(normalizeTextProfile(kind, body.text_profile)),
      normalizeOutputType(kind, body.output_type),
      JSON.stringify(normalizeStringArray(body.input_reference_images)),
      now,
      now,
    );
    const created = this.getProjectAsset(Number(result.lastInsertRowid)) as ProjectAssetRow;
    this.log?.audit?.('project.asset.created', { projectId, asset: created });
    return created;
  }

  updateProjectAsset(id: number, input: unknown): ProjectAssetRow {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError('项目资产不存在');
    const body = asRecord(input) ?? {};
    const name = body.name === undefined ? current.name : readString(body.name);
    if (!name) throw new ValidationError('资产卡名称不能为空');
    const textProfile = body.text_profile === undefined
      ? current.text_profile
      : normalizeTextProfile(current.kind, body.text_profile);
    const outputType = body.output_type === undefined
      ? current.output_type
      : normalizeOutputType(current.kind, body.output_type);
    const inputReferences = body.input_reference_images === undefined
      ? current.input_reference_images
      : normalizeStringArray(body.input_reference_images);
    this.db.prepare(`
      UPDATE project_assets
      SET name = ?, text_profile = ?, output_type = ?, input_reference_images = ?, updated_at = ?
      WHERE id = ?
    `).run(name, JSON.stringify(textProfile), outputType, JSON.stringify(inputReferences), new Date().toISOString(), id);
    const updated = this.getProjectAsset(id) as ProjectAssetRow;
    this.log?.audit?.('project.asset.updated', { projectId: current.drama_id, asset: updated });
    return updated;
  }

  deleteProjectAsset(id: number): boolean {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError('项目资产不存在');
    const removed = this.db.prepare('DELETE FROM project_assets WHERE id = ?').run(id).changes > 0;
    if (removed) this.log?.audit?.('project.asset.deleted', { id, projectId: current.drama_id, kind: current.kind });
    return removed;
  }

  getStoryboard(id: number): StoryboardRow | undefined {
    const row = this.db.prepare('SELECT * FROM storyboards WHERE id = ?').get(id) as RawStoryboard | undefined;
    return row ? this.hydrateStoryboard(row) : undefined;
  }

  listStoryboards(episodeId: number): StoryboardRow[] {
    const rows = this.db.prepare('SELECT * FROM storyboards WHERE episode_id = ? ORDER BY storyboard_number')
      .all(episodeId) as RawStoryboard[];
    return rows.map((row) => this.hydrateStoryboard(row));
  }

  episode(id: number): EpisodeRow | undefined {
    return this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as EpisodeRow | undefined;
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
        shot_size, camera_angle, camera_movement, composition, lighting, mood, sound,
        image_prompt, video_prompt, extra_reference_images, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      episodeId,
      number,
      textOrNull(body.title),
      textOrNull(body.description),
      textOrNull(body.action),
      textOrNull(body.dialogue),
      textOrNull(body.shot_size),
      textOrNull(body.camera_angle),
      textOrNull(body.camera_movement),
      textOrNull(body.composition),
      textOrNull(body.lighting),
      textOrNull(body.mood),
      textOrNull(body.sound),
      textOrNull(body.image_prompt),
      textOrNull(body.video_prompt),
      JSON.stringify(normalizeStringArray(body.extra_reference_images)),
      now,
      now,
    );
    const id = Number(result.lastInsertRowid);
    this.syncStoryboardAssets(id, episode.drama_id, body.project_asset_ids);
    const created = this.getStoryboard(id) as StoryboardRow;
    this.log?.audit?.('storyboard.created', { storyboard: created });
    return created;
  }

  updateStoryboard(id: number, input: unknown): StoryboardRow {
    const current = this.getStoryboard(id);
    if (!current) throw new NotFoundError('分镜不存在');
    const body = asRecord(input) ?? {};
    const extraReferences = body.extra_reference_images === undefined
      ? current.extra_reference_images
      : normalizeStringArray(body.extra_reference_images);
    this.db.prepare(`
      UPDATE storyboards SET storyboard_number = ?, title = ?, description = ?, action = ?, dialogue = ?,
        shot_size = ?, camera_angle = ?, camera_movement = ?, composition = ?, lighting = ?, mood = ?, sound = ?,
        image_prompt = ?, video_prompt = ?, extra_reference_images = ?, updated_at = ?
      WHERE id = ?
    `).run(
      readNumber(body.storyboard_number) ?? current.storyboard_number,
      optionalText(body, 'title', current.title),
      optionalText(body, 'description', current.description),
      optionalText(body, 'action', current.action),
      optionalText(body, 'dialogue', current.dialogue),
      optionalText(body, 'shot_size', current.shot_size),
      optionalText(body, 'camera_angle', current.camera_angle),
      optionalText(body, 'camera_movement', current.camera_movement),
      optionalText(body, 'composition', current.composition),
      optionalText(body, 'lighting', current.lighting),
      optionalText(body, 'mood', current.mood),
      optionalText(body, 'sound', current.sound),
      optionalText(body, 'image_prompt', current.image_prompt),
      optionalText(body, 'video_prompt', current.video_prompt),
      JSON.stringify(extraReferences),
      new Date().toISOString(),
      id,
    );
    if (Object.prototype.hasOwnProperty.call(body, 'project_asset_ids')) {
      const episode = this.episode(current.episode_id) as EpisodeRow;
      this.syncStoryboardAssets(id, episode.drama_id, body.project_asset_ids);
    }
    const updated = this.getStoryboard(id) as StoryboardRow;
    this.log?.audit?.('storyboard.updated', { storyboard: updated });
    return updated;
  }

  deleteStoryboard(id: number): boolean {
    const current = this.getStoryboard(id);
    if (!current) return false;
    const removed = this.db.transaction(() => {
      const changed = this.db.prepare('DELETE FROM storyboards WHERE id = ?').run(id).changes > 0;
      if (!changed) return false;
      const remaining = this.db.prepare(
        'SELECT id FROM storyboards WHERE episode_id = ? ORDER BY storyboard_number, id',
      ).all(current.episode_id) as Array<{ id: number }>;
      remaining.forEach((row, index) => {
        this.db.prepare('UPDATE storyboards SET storyboard_number = ? WHERE id = ?').run(-(index + 1), row.id);
      });
      remaining.forEach((row, index) => {
        this.db.prepare('UPDATE storyboards SET storyboard_number = ?, updated_at = ? WHERE id = ?')
          .run(index + 1, new Date().toISOString(), row.id);
      });
      return true;
    })();
    if (removed) this.log?.audit?.('storyboard.deleted', { storyboardId: id, episodeId: current.episode_id });
    return removed;
  }

  syncStoryboards(episodeId: number, values: unknown[]): StoryboardRow[] {
    if (!this.episode(episodeId)) throw new NotFoundError('集数不存在');
    this.db.transaction(() => {
      values.forEach((raw, index) => {
        const body = { ...asRecord(raw), storyboard_number: index + 1 };
        const existing = this.db.prepare('SELECT id FROM storyboards WHERE episode_id = ? AND storyboard_number = ?')
          .get(episodeId, index + 1) as { id: number } | undefined;
        if (existing) this.updateStoryboard(existing.id, body);
        else this.createStoryboard({ ...body, episode_id: episodeId });
      });
      this.db.prepare('DELETE FROM storyboards WHERE episode_id = ? AND storyboard_number > ?').run(episodeId, values.length);
    })();
    const storyboards = this.listStoryboards(episodeId);
    this.log?.audit?.('storyboards.synchronized', { episodeId, storyboards });
    return storyboards;
  }

  private requireProject(projectId: number): void {
    if (!this.db.prepare('SELECT id FROM dramas WHERE id = ?').get(projectId)) throw new NotFoundError('项目不存在');
  }

  private hydrateStoryboard(row: RawStoryboard): StoryboardRow {
    return {
      ...row,
      project_asset_ids: relationIds(this.db, row.id),
      extra_reference_images: parseJson<string[]>(row.extra_reference_images, []),
    };
  }

  private syncStoryboardAssets(storyboardId: number, projectId: number, rawIds: unknown): void {
    const ids = Array.isArray(rawIds) ? rawIds.map(readNumber).filter((id): id is number => Boolean(id)) : [];
    const valid = [...new Set(ids)].filter((id) => this.getProjectAsset(id)?.drama_id === projectId);
    this.db.prepare('DELETE FROM storyboard_project_assets WHERE storyboard_id = ?').run(storyboardId);
    const insert = this.db.prepare('INSERT INTO storyboard_project_assets (storyboard_id, project_asset_id) VALUES (?, ?)');
    valid.forEach((assetId) => insert.run(storyboardId, assetId));
  }
}

interface RawProjectAsset extends Omit<ProjectAssetRow, 'text_profile' | 'input_reference_images'> {
  text_profile: string;
  input_reference_images: string;
}

interface RawStoryboard extends Omit<StoryboardRow, 'project_asset_ids' | 'extra_reference_images'> {
  extra_reference_images: string;
}

function hydrateProjectAsset(row: RawProjectAsset): ProjectAssetRow {
  return {
    ...row,
    text_profile: parseJson<AssetTextProfile>(row.text_profile, {}),
    input_reference_images: parseJson<string[]>(row.input_reference_images, []),
  };
}

function relationIds(db: SQLiteDatabase, storyboardId: number): number[] {
  return (db.prepare(`
    SELECT project_asset_id AS id
    FROM storyboard_project_assets
    WHERE storyboard_id = ?
    ORDER BY project_asset_id
  `).all(storyboardId) as Array<{ id: number }>).map((item) => item.id);
}

function assetKind(value: unknown): AssetKind {
  if (value === 'character' || value === 'scene' || value === 'prop') return value;
  throw new ValidationError('资产类型必须是 character、scene 或 prop');
}

function assetLabel(kind: AssetKind): string {
  return { character: '角色', scene: '场景', prop: '道具' }[kind];
}

export function normalizeTextProfile(kind: AssetKind, value: unknown): AssetTextProfile {
  const source = asRecord(value) ?? {};
  const supported = new Set(PROFILE_FIELDS[kind]);
  const unknown = Object.keys(source).filter((key) => !supported.has(key));
  if (unknown.length) throw new ValidationError(`${assetLabel(kind)}卡包含不支持的字段：${unknown.join('、')}`);
  const result: AssetTextProfile = {};
  for (const key of PROFILE_FIELDS[kind]) {
    const raw = source[key];
    if (typeof raw === 'string') {
      const cleaned = raw.trim();
      if (cleaned) result[key] = cleaned;
      continue;
    }
    if (Array.isArray(raw)) {
      const cleaned = normalizeStringArray(raw);
      if (cleaned.length) result[key] = cleaned;
    }
  }
  return result;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

export function normalizeOutputType(kind: AssetKind, value: unknown): AssetOutputType {
  const outputType = readString(value) ?? DEFAULT_OUTPUT_TYPE[kind];
  if (OUTPUT_TYPES[kind].includes(outputType as AssetOutputType)) return outputType as AssetOutputType;
  throw new ValidationError(`${assetLabel(kind)}卡产出类型无效`);
}

function textOrNull(value: unknown): string | null {
  return readString(value) ?? null;
}

function optionalText(body: Record<string, unknown>, key: string, current: string | null): string | null {
  return body[key] === undefined ? current : textOrNull(body[key]);
}
