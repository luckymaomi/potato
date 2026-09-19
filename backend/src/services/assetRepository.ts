import { NotFoundError, ValidationError } from '../errors';
import type { Logger, SQLiteDatabase } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import type { AssetKind, AssetLibraryItemRow, CharacterRow, EpisodeRow, ProjectAssetRow, PropRow, SceneRow, StoryboardRow } from '../types/domain';

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

  listLibrary(kind?: AssetKind): AssetLibraryItemRow[] {
    const rows = (kind
      ? this.db.prepare('SELECT * FROM asset_library_items WHERE kind = ? ORDER BY updated_at DESC, id DESC').all(kind)
      : this.db.prepare('SELECT * FROM asset_library_items ORDER BY updated_at DESC, id DESC').all()) as AssetLibraryItemRow[];
    return rows;
  }

  getLibraryItem(id: number): AssetLibraryItemRow | undefined {
    return this.db.prepare('SELECT * FROM asset_library_items WHERE id = ?').get(id) as AssetLibraryItemRow | undefined;
  }

  createLibraryItem(input: unknown): AssetLibraryItemRow {
    const body = asRecord(input) ?? {};
    const kind = assetKind(body.kind);
    const name = readString(body.name) ?? `未命名${assetLabel(kind)}`;
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO asset_library_items (kind, name, description, appearance, prompt, visual_description, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(kind, name, value(body.description), value(body.appearance), value(body.prompt), value(body.visual_description), '{}', now, now);
    return this.getLibraryItem(Number(result.lastInsertRowid)) as AssetLibraryItemRow;
  }

  updateLibraryItem(id: number, input: unknown): AssetLibraryItemRow {
    const current = this.getLibraryItem(id);
    if (!current) throw new NotFoundError('全局资产不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE asset_library_items SET name = ?, description = ?, appearance = ?, prompt = ?, visual_description = ?, updated_at = ? WHERE id = ?
    `).run(
      readString(body.name) ?? current.name,
      optional(body, 'description', current.description),
      optional(body, 'appearance', current.appearance),
      optional(body, 'prompt', current.prompt),
      optional(body, 'visual_description', current.visual_description),
      new Date().toISOString(), id,
    );
    return this.getLibraryItem(id) as AssetLibraryItemRow;
  }

  listProjectAssets(projectId: number, kind?: AssetKind): ProjectAssetRow[] {
    this.requireProject(projectId);
    const rows = (kind
      ? this.db.prepare('SELECT * FROM project_assets WHERE drama_id = ? AND kind = ? ORDER BY id').all(projectId, kind)
      : this.db.prepare('SELECT * FROM project_assets WHERE drama_id = ? ORDER BY id').all(projectId)) as ProjectAssetRow[];
    return rows.map((row) => this.hydrateProjectAsset(row));
  }

  getProjectAsset(id: number): ProjectAssetRow | undefined {
    const row = this.db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id) as ProjectAssetRow | undefined;
    return row ? this.hydrateProjectAsset(row) : undefined;
  }

  createProjectAsset(projectId: number, input: unknown): ProjectAssetRow {
    this.requireProject(projectId);
    const body = asRecord(input) ?? {};
    const libraryId = readNumber(body.from_library_item_id) ?? readNumber(body.library_item_id);
    const library = libraryId ? this.getLibraryItem(libraryId) : undefined;
    if (libraryId && !library) throw new NotFoundError('全局资产不存在');
    const kind = library?.kind ?? assetKind(body.kind);
    const name = readString(body.name) ?? library?.name;
    const resolvedName = name ?? `未命名${assetLabel(kind)}`;
    const now = new Date().toISOString();
    const locked = library?.current_image_generation_id ?? null;
    const result = this.db.prepare(`
      INSERT INTO project_assets (
        drama_id, library_item_id, kind, name, description, appearance, prompt, visual_description,
        image_url, local_path, locked_image_generation_id, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(
      projectId, library?.id ?? null, kind, resolvedName,
      value(body.description) ?? library?.description ?? null,
      value(body.appearance) ?? library?.appearance ?? null,
      value(body.prompt) ?? library?.prompt ?? null,
      value(body.visual_description) ?? library?.visual_description ?? null,
      library?.image_url ?? null, library?.local_path ?? null, locked, now, now,
    );
    const id = Number(result.lastInsertRowid);
    if (Object.prototype.hasOwnProperty.call(body, 'dependency_asset_ids')) {
      this.syncProjectAssetDependencies(id, body.dependency_asset_ids);
    }
    return this.getProjectAsset(id) as ProjectAssetRow;
  }

  syncProjectAssets(projectId: number, kind: AssetKind, values: unknown[]): ProjectAssetRow[] {
    this.requireProject(projectId);
    const save = this.db.transaction(() => values.map((raw) => {
      const body = asRecord(raw) ?? {};
      const requestedName = readString(body.name) ?? readString(body.location) ?? `未命名${assetLabel(kind)}`;
      const existing = this.listProjectAssets(projectId, kind).find((item) => sameKey(item.name, requestedName));
      const fields = {
        name: requestedName,
        description: readString(body.description),
        appearance: readString(body.appearance),
        prompt: readString(body.prompt),
        visual_description: readString(body.visual_description),
      };
      if (existing) return this.updateProjectAsset(existing.id, fields);
      return this.createProjectAsset(projectId, { kind, ...fields });
    }));
    const records = save();
    this.log?.audit?.('project.assets.synchronized', { projectId, kind, records });
    return records;
  }

  updateProjectAsset(id: number, input: unknown): ProjectAssetRow {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError('项目资产不存在');
    const body = asRecord(input) ?? {};
    this.db.prepare(`
      UPDATE project_assets SET name = ?, description = ?, appearance = ?, prompt = ?, visual_description = ?, updated_at = ? WHERE id = ?
    `).run(
      readString(body.name) ?? current.name,
      optional(body, 'description', current.description),
      optional(body, 'appearance', current.appearance),
      optional(body, 'prompt', current.prompt),
      optional(body, 'visual_description', current.visual_description),
      new Date().toISOString(), id,
    );
    if (Object.prototype.hasOwnProperty.call(body, 'dependency_asset_ids')) {
      this.syncProjectAssetDependencies(id, body.dependency_asset_ids);
    }
    return this.getProjectAsset(id) as ProjectAssetRow;
  }

  deleteProjectAsset(id: number): boolean {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError('项目资产不存在');
    const result = this.db.prepare('DELETE FROM project_assets WHERE id = ?').run(id);
    this.log?.audit?.('project.asset.deleted', { id, projectId: current.drama_id, kind: current.kind });
    return result.changes > 0;
  }

  lockProjectAsset(id: number): ProjectAssetRow {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError('项目资产不存在');
    const generationId = current.current_image_generation_id
      ?? (current.library_item_id ? this.getLibraryItem(current.library_item_id)?.current_image_generation_id : null)
      ?? null;
    this.db.prepare('UPDATE project_assets SET locked_image_generation_id = ?, updated_at = ? WHERE id = ?')
      .run(generationId, new Date().toISOString(), id);
    return this.getProjectAsset(id) as ProjectAssetRow;
  }

  upgradeProjectAsset(id: number): ProjectAssetRow {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError('项目资产不存在');
    if (!current.library_item_id) throw new ValidationError('本地资产没有全局库版本可升级');
    const library = this.getLibraryItem(current.library_item_id);
    if (!library) throw new NotFoundError('关联的全局资产不存在');
    this.db.prepare(`
      UPDATE project_assets SET image_url = ?, local_path = ?, locked_image_generation_id = ?, updated_at = ? WHERE id = ?
    `).run(library.image_url, library.local_path, library.current_image_generation_id, new Date().toISOString(), id);
    return this.getProjectAsset(id) as ProjectAssetRow;
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
        shot_size, camera_angle, camera_movement, composition, lighting, mood, sound,
        image_prompt, negative_prompt, video_prompt, grid_rows, grid_columns, duration, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      episodeId, number, value(body.title), value(body.description), value(body.action), value(body.dialogue),
      value(body.shot_size), value(body.camera_angle), value(body.camera_movement), value(body.composition),
      value(body.lighting), value(body.mood), value(body.sound),
      value(body.image_prompt), value(body.negative_prompt), value(body.video_prompt),
      gridRows(body), gridColumns(body), readNumber(body.duration) ?? null, now, now,
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
        shot_size = ?, camera_angle = ?, camera_movement = ?, composition = ?, lighting = ?, mood = ?, sound = ?,
        image_prompt = ?, negative_prompt = ?, video_prompt = ?, grid_rows = ?, grid_columns = ?, duration = ?, updated_at = ? WHERE id = ?
    `).run(
      readNumber(body.storyboard_number) ?? current.storyboard_number,
      optional(body, 'title', current.title), optional(body, 'description', current.description),
      optional(body, 'action', current.action), optional(body, 'dialogue', current.dialogue),
      optional(body, 'shot_size', current.shot_size), optional(body, 'camera_angle', current.camera_angle),
      optional(body, 'camera_movement', current.camera_movement), optional(body, 'composition', current.composition),
      optional(body, 'lighting', current.lighting), optional(body, 'mood', current.mood), optional(body, 'sound', current.sound),
      optional(body, 'image_prompt', current.image_prompt), optional(body, 'negative_prompt', current.negative_prompt),
      optional(body, 'video_prompt', current.video_prompt),
      gridRows(body, current.grid_rows), gridColumns(body, current.grid_columns),
      body.duration === undefined ? current.duration : readNumber(body.duration) ?? null,
      new Date().toISOString(), id,
    );
    const episode = this.episode(current.episode_id) as EpisodeRow;
    if (hasLinkFields(body)) this.syncStoryboardLinks(id, episode.drama_id, body);
    const updated = this.getStoryboard(id) as StoryboardRow;
    this.log?.audit?.('storyboard.updated', { storyboard: updated });
    return updated;
  }

  deleteStoryboard(id: number): boolean {
    return this.db.prepare('DELETE FROM storyboards WHERE id = ?').run(id).changes > 0;
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

  private requireProject(projectId: number): void {
    const project = this.db.prepare('SELECT id FROM dramas WHERE id = ?').get(projectId);
    if (!project) throw new NotFoundError('项目不存在');
  }

  private hydrateProjectAsset(row: ProjectAssetRow): ProjectAssetRow {
    return {
      ...row,
      dependency_asset_ids: ids(this.db, 'project_asset_dependencies', 'depends_on_asset_id', row.id, 'project_asset_id'),
    };
  }

  private syncProjectAssetDependencies(assetId: number, rawIds: unknown): void {
    const asset = this.getProjectAsset(assetId);
    if (!asset) throw new NotFoundError('项目资产不存在');
    const requested = Array.isArray(rawIds)
      ? [...new Set(rawIds.map(readNumber).filter((id): id is number => Boolean(id && id !== assetId)))]
      : [];
    for (const dependencyId of requested) {
      const dependency = this.getProjectAsset(dependencyId);
      if (!dependency || dependency.drama_id !== asset.drama_id) throw new ValidationError('资产依赖必须属于同一项目');
      if (this.dependencyReaches(dependencyId, assetId)) throw new ValidationError('资产依赖不能形成循环');
    }
    this.db.prepare('DELETE FROM project_asset_dependencies WHERE project_asset_id = ?').run(assetId);
    const insert = this.db.prepare('INSERT INTO project_asset_dependencies (project_asset_id, depends_on_asset_id) VALUES (?, ?)');
    requested.forEach((dependencyId) => insert.run(assetId, dependencyId));
  }

  private dependencyReaches(startId: number, targetId: number): boolean {
    const visited = new Set<number>();
    const pending = [startId];
    while (pending.length) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      if (current === targetId) return true;
      visited.add(current);
      const next = ids(this.db, 'project_asset_dependencies', 'depends_on_asset_id', current, 'project_asset_id');
      pending.push(...next);
    }
    return false;
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
      project_asset_ids: ids(this.db, 'storyboard_project_assets', 'project_asset_id', row.id),
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
    if (Object.prototype.hasOwnProperty.call(body, 'project_asset_ids')) {
      const projectAssets = Array.isArray(body.project_asset_ids)
        ? body.project_asset_ids.map(readNumber).filter((id): id is number => Boolean(id && this.getProjectAsset(id)?.drama_id === projectId))
        : [];
      this.db.prepare('DELETE FROM storyboard_project_assets WHERE storyboard_id = ?').run(storyboardId);
      const insert = this.db.prepare('INSERT INTO storyboard_project_assets (storyboard_id, project_asset_id) VALUES (?, ?)');
      [...new Set(projectAssets)].forEach((id) => insert.run(storyboardId, id));
    }
  }

}

function ids(db: SQLiteDatabase, table: string, column: string, ownerId: number, ownerColumn = 'storyboard_id'): number[] {
  return (db.prepare(`SELECT ${column} AS id FROM ${table} WHERE ${ownerColumn} = ? ORDER BY ${column}`).all(ownerId) as Array<{ id: number }>).map((item) => item.id);
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
  return ['character_ids', 'scene_ids', 'prop_ids', 'project_asset_ids', 'characters', 'character_names', 'scenes', 'scene_names', 'props', 'prop_names']
    .some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function gridRows(body: Record<string, unknown>, fallback = 1): number {
  return boundedGrid(body.grid_rows, fallback);
}

function gridColumns(body: Record<string, unknown>, fallback = 1): number {
  return boundedGrid(body.grid_columns, fallback);
}

function boundedGrid(value: unknown, fallback: number): number {
  const parsed = readNumber(value);
  return parsed === undefined ? fallback : Math.max(1, Math.min(8, Math.trunc(parsed)));
}

function assetKind(value: unknown): AssetKind {
  if (value === 'character' || value === 'scene' || value === 'prop') return value;
  throw new ValidationError('资产类型无效');
}

function assetLabel(kind: AssetKind): string {
  return { character: '人物', scene: '场景', prop: '道具' }[kind];
}
