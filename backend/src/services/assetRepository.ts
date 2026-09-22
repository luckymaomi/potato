import { NotFoundError, ValidationError } from "../errors";
import type { Logger, SQLiteDatabase } from "../types/core";
import { asRecord, parseJson, readNumber, readString } from "../types/core";
import type {
  AssetKind,
  AssetOutputType,
  AssetTextProfile,
  EpisodeRow,
  ProjectAssetRow,
  PanelRow,
} from "../types/domain";

const PROFILE_FIELDS: Record<AssetKind, readonly string[]> = {
  character: [
    "age",
    "gender",
    "occupation",
    "faction",
    "face_shape",
    "facial_features",
    "hairstyle",
    "body_type",
    "skin_tone",
    "default_outfit",
    "personality",
    "common_expressions",
    "aura",
    "voice_tone_id",
    "speech_rate",
    "accent",
    "signature_phrase",
  ],
  scene: [
    "location_type",
    "layout",
    "architectural_style",
    "scale",
    "time_of_day",
    "light_source",
    "color_temperature",
    "contrast",
    "key_furniture",
    "props",
    "decorations",
    "vegetation",
    "palette",
    "emotion",
    "weather",
  ],
  prop: [
    "category",
    "size",
    "material",
    "color",
    "shape",
    "condition",
    "special_marks",
    "unique_design",
    "default_state",
    "interaction_states",
    "bindings",
  ],
};

const OUTPUT_TYPES: Record<AssetKind, readonly AssetOutputType[]> = {
  character: [
    "character-layout-a",
    "character-layout-b",
    "character-layout-c",
    "character-layout-d",
  ],
  scene: ["scene-panorama", "scene-detail", "scene-lighting-variant"],
  prop: ["prop-multi-angle", "prop-state-variant"],
};

const DEFAULT_OUTPUT_TYPE: Record<AssetKind, AssetOutputType> = {
  character: "character-layout-a",
  scene: "scene-panorama",
  prop: "prop-multi-angle",
};

export class AssetRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly log?: Logger,
  ) {}

  listProjectAssets(projectId: number, kind?: AssetKind): ProjectAssetRow[] {
    this.requireProject(projectId);
    const rows = (
      kind
        ? this.db
            .prepare(
              "SELECT * FROM project_assets WHERE drama_id = ? AND kind = ? ORDER BY id",
            )
            .all(projectId, kind)
        : this.db
            .prepare(
              "SELECT * FROM project_assets WHERE drama_id = ? ORDER BY id",
            )
            .all(projectId)
    ) as RawProjectAsset[];
    return rows.map(hydrateProjectAsset);
  }

  getProjectAsset(id: number): ProjectAssetRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM project_assets WHERE id = ?")
      .get(id) as RawProjectAsset | undefined;
    return row ? hydrateProjectAsset(row) : undefined;
  }

  createProjectAsset(projectId: number, input: unknown): ProjectAssetRow {
    this.requireProject(projectId);
    const body = asRecord(input) ?? {};
    const kind = assetKind(body.kind);
    const name = readString(body.name) ?? `未命名${assetLabel(kind)}`;
    const textProfile = normalizeTextProfile(kind, body.text_profile);
    const outputType = normalizeOutputType(kind, body.output_type);
    const outputPrompt =
      body.output_prompt === undefined
        ? ""
        : outputPromptValue(body.output_prompt);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
      INSERT INTO project_assets (
        drama_id, kind, name, text_profile, output_type, output_prompt, input_reference_images, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        projectId,
        kind,
        name,
        JSON.stringify(textProfile),
        outputType,
        outputPrompt,
        JSON.stringify(normalizeStringArray(body.input_reference_images)),
        now,
        now,
      );
    const created = this.getProjectAsset(
      Number(result.lastInsertRowid),
    ) as ProjectAssetRow;
    this.log?.audit?.("project.asset.created", { projectId, asset: created });
    return created;
  }

  updateProjectAsset(id: number, input: unknown): ProjectAssetRow {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError("项目资产不存在");
    const body = asRecord(input) ?? {};
    const name = body.name === undefined ? current.name : readString(body.name);
    if (!name) throw new ValidationError("资产卡名称不能为空");
    const textProfile =
      body.text_profile === undefined
        ? current.text_profile
        : normalizeTextProfile(current.kind, body.text_profile);
    const outputType =
      body.output_type === undefined
        ? current.output_type
        : normalizeOutputType(current.kind, body.output_type);
    const inputReferences =
      body.input_reference_images === undefined
        ? current.input_reference_images
        : normalizeStringArray(body.input_reference_images);
    const outputPrompt =
      body.output_prompt === undefined
        ? current.output_prompt
        : outputPromptValue(body.output_prompt);
    this.db
      .prepare(
        `
      UPDATE project_assets
      SET name = ?, text_profile = ?, output_type = ?, output_prompt = ?, input_reference_images = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(
        name,
        JSON.stringify(textProfile),
        outputType,
        outputPrompt,
        JSON.stringify(inputReferences),
        new Date().toISOString(),
        id,
      );
    if (
      JSON.stringify(textProfile) !== JSON.stringify(current.text_profile) ||
      outputPrompt !== current.output_prompt
    ) {
      this.markAssetImageChanged(id);
    }
    const updated = this.getProjectAsset(id) as ProjectAssetRow;
    this.log?.audit?.("project.asset.updated", {
      projectId: current.drama_id,
      asset: updated,
    });
    return updated;
  }

  deleteProjectAsset(id: number): boolean {
    const current = this.getProjectAsset(id);
    if (!current) throw new NotFoundError("项目资产不存在");
    const removed =
      this.db.prepare("DELETE FROM project_assets WHERE id = ?").run(id)
        .changes > 0;
    if (removed)
      this.log?.audit?.("project.asset.deleted", {
        id,
        projectId: current.drama_id,
        kind: current.kind,
      });
    return removed;
  }

  getPanel(id: number): PanelRow | undefined {
    const row = this.db.prepare("SELECT * FROM panels WHERE id = ?").get(id) as
      | RawPanel
      | undefined;
    return row ? this.hydratePanel(row) : undefined;
  }

  listPanels(episodeId: number): PanelRow[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM panels WHERE episode_id = ? ORDER BY panel_number",
      )
      .all(episodeId) as RawPanel[];
    return rows.map((row) => this.hydratePanel(row));
  }

  episode(id: number): EpisodeRow | undefined {
    return this.db.prepare("SELECT * FROM episodes WHERE id = ?").get(id) as
      | EpisodeRow
      | undefined;
  }

  createPanel(input: unknown): PanelRow {
    const body = asRecord(input) ?? {};
    const episodeId = readNumber(body.episode_id);
    if (!episodeId) throw new ValidationError("关联集数 ID 无效");
    const episode = this.episode(episodeId);
    if (!episode) throw new NotFoundError("关联集数不存在");
    const number =
      readNumber(body.panel_number) ?? this.listPanels(episodeId).length + 1;
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
      `
      INSERT INTO panels (
        episode_id, panel_number, title, description, action, expression,
        framing, viewpoint, composition, lighting, mood,
        image_prompt, image_recipe_prompt, image_recipe_references, extra_reference_images, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        episodeId,
        number,
        textOrNull(body.title),
        textOrNull(body.description),
        textOrNull(body.action),
        textOrNull(body.expression),
        textOrNull(body.framing),
        textOrNull(body.viewpoint),
        textOrNull(body.composition),
        textOrNull(body.lighting),
        textOrNull(body.mood),
        textOrNull(body.image_prompt),
        promptValue(body.image_recipe_prompt),
        JSON.stringify(normalizeStringArray(body.image_recipe_references)),
        JSON.stringify(normalizeStringArray(body.extra_reference_images)),
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    this.syncPanelAssets(id, episode.drama_id, body.project_asset_ids);
    const created = this.getPanel(id) as PanelRow;
    this.log?.audit?.("panel.created", { panel: created });
    return created;
  }

  updatePanel(id: number, input: unknown): PanelRow {
    const current = this.getPanel(id);
    if (!current) throw new NotFoundError("分格不存在");
    const body = asRecord(input) ?? {};
    const extraReferences =
      body.extra_reference_images === undefined
        ? current.extra_reference_images
        : normalizeStringArray(body.extra_reference_images);
    const imageRecipeReferences =
      body.image_recipe_references === undefined
        ? current.image_recipe_references
        : normalizeStringArray(body.image_recipe_references);
    const nextAssetIds = Object.prototype.hasOwnProperty.call(
      body,
      "project_asset_ids",
    )
      ? this.validAssetIds(current.episode_id, body.project_asset_ids)
      : current.project_asset_ids;
    const specificationChanged = panelSpecificationChanged(
      current,
      body,
      extraReferences,
      nextAssetIds,
    );
    const recipeSaved = hasCompleteRecipeSnapshot(body);
    this.db
      .prepare(
        `
      UPDATE panels SET panel_number = ?, title = ?, description = ?, action = ?, expression = ?,
        framing = ?, viewpoint = ?, composition = ?, lighting = ?, mood = ?,
        image_prompt = ?, image_recipe_prompt = ?, image_recipe_references = ?, extra_reference_images = ?,
        image_needs_review = ?, recipe_needs_reassembly = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(
        readNumber(body.panel_number) ?? current.panel_number,
        optionalText(body, "title", current.title),
        optionalText(body, "description", current.description),
        optionalText(body, "action", current.action),
        optionalText(body, "expression", current.expression),
        optionalText(body, "framing", current.framing),
        optionalText(body, "viewpoint", current.viewpoint),
        optionalText(body, "composition", current.composition),
        optionalText(body, "lighting", current.lighting),
        optionalText(body, "mood", current.mood),
        optionalText(body, "image_prompt", current.image_prompt),
        optionalPrompt(
          body,
          "image_recipe_prompt",
          current.image_recipe_prompt,
        ),
        JSON.stringify(imageRecipeReferences),
        JSON.stringify(extraReferences),
        specificationChanged
          ? Number(
              Boolean(current.image_url || current.image_recipe_prompt.trim()),
            )
          : Number(current.image_needs_review),
        recipeSaved
          ? 0
          : specificationChanged
            ? 1
            : Number(current.recipe_needs_reassembly),
        new Date().toISOString(),
        id,
      );
    if (Object.prototype.hasOwnProperty.call(body, "project_asset_ids")) {
      const episode = this.episode(current.episode_id) as EpisodeRow;
      this.syncPanelAssets(id, episode.drama_id, nextAssetIds);
    }
    const updated = this.getPanel(id) as PanelRow;
    this.log?.audit?.("panel.updated", { panel: updated });
    return updated;
  }

  deletePanel(id: number): boolean {
    const current = this.getPanel(id);
    if (!current) return false;
    const removed = this.db.transaction(() => {
      const changed =
        this.db.prepare("DELETE FROM panels WHERE id = ?").run(id).changes > 0;
      if (!changed) return false;
      const remaining = this.db
        .prepare(
          "SELECT id FROM panels WHERE episode_id = ? ORDER BY panel_number, id",
        )
        .all(current.episode_id) as Array<{ id: number }>;
      remaining.forEach((row, index) => {
        this.db
          .prepare("UPDATE panels SET panel_number = ? WHERE id = ?")
          .run(-(index + 1), row.id);
      });
      remaining.forEach((row, index) => {
        this.db
          .prepare(
            "UPDATE panels SET panel_number = ?, updated_at = ? WHERE id = ?",
          )
          .run(index + 1, new Date().toISOString(), row.id);
      });
      return true;
    })();
    if (removed)
      this.log?.audit?.("panel.deleted", {
        panelId: id,
        episodeId: current.episode_id,
      });
    return removed;
  }

  syncPanels(episodeId: number, values: unknown[]): PanelRow[] {
    if (!this.episode(episodeId)) throw new NotFoundError("话不存在");
    this.db.transaction(() => {
      values.forEach((raw, index) => {
        const body = { ...asRecord(raw), panel_number: index + 1 };
        const existing = this.db
          .prepare(
            "SELECT id FROM panels WHERE episode_id = ? AND panel_number = ?",
          )
          .get(episodeId, index + 1) as { id: number } | undefined;
        if (existing) this.updatePanel(existing.id, body);
        else this.createPanel({ ...body, episode_id: episodeId });
      });
      this.db
        .prepare("DELETE FROM panels WHERE episode_id = ? AND panel_number > ?")
        .run(episodeId, values.length);
    })();
    const panels = this.listPanels(episodeId);
    this.log?.audit?.("panels.synchronized", { episodeId, panels });
    return panels;
  }

  markAssetImageChanged(assetId: number): void {
    if (!this.getProjectAsset(assetId))
      throw new NotFoundError("项目资产不存在");
    this.db
      .prepare(
        `
      UPDATE panels
      SET image_needs_review = CASE WHEN image_url IS NOT NULL OR image_recipe_prompt <> '' THEN 1 ELSE image_needs_review END,
          updated_at = ?
      WHERE id IN (SELECT panel_id FROM panel_project_assets WHERE project_asset_id = ?)
    `,
      )
      .run(new Date().toISOString(), assetId);
  }

  markPanelImageChanged(
    panelId: number,
    input: { imageSelected: boolean },
  ): void {
    const changed = this.db
      .prepare(
        `
      UPDATE panels
      SET image_needs_review = ?,
          updated_at = ?
      WHERE id = ?
    `,
      )
      .run(
        input.imageSelected ? 0 : 1,
        new Date().toISOString(),
        panelId,
      ).changes;
    if (!changed) throw new NotFoundError("分格不存在");
  }

  confirmPanelReview(panelId: number): PanelRow {
    const column = "image_needs_review";
    const changed = this.db
      .prepare(`UPDATE panels SET ${column} = 0, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), panelId).changes;
    if (!changed) throw new NotFoundError("分格不存在");
    return this.getPanel(panelId) as PanelRow;
  }

  setPanelReviewState(
    panelId: number,
    input: Pick<PanelRow, "image_needs_review" | "recipe_needs_reassembly">,
  ): void {
    this.db
      .prepare(
        "UPDATE panels SET image_needs_review = ?, recipe_needs_reassembly = ? WHERE id = ?",
      )
      .run(
        Number(input.image_needs_review),
        Number(input.recipe_needs_reassembly),
        panelId,
      );
  }

  private requireProject(projectId: number): void {
    if (!this.db.prepare("SELECT id FROM dramas WHERE id = ?").get(projectId))
      throw new NotFoundError("项目不存在");
  }

  private hydratePanel(row: RawPanel): PanelRow {
    return {
      ...row,
      project_asset_ids: relationIds(this.db, row.id),
      extra_reference_images: parseJson<string[]>(
        row.extra_reference_images,
        [],
      ),
      image_recipe_references: parseJson<string[]>(
        row.image_recipe_references,
        [],
      ),
      image_needs_review: Boolean(row.image_needs_review),
      recipe_needs_reassembly: Boolean(row.recipe_needs_reassembly),
    };
  }

  private syncPanelAssets(
    panelId: number,
    projectId: number,
    rawIds: unknown,
  ): void {
    const ids = Array.isArray(rawIds)
      ? rawIds.map(readNumber).filter((id): id is number => Boolean(id))
      : [];
    const valid = [...new Set(ids)].filter(
      (id) => this.getProjectAsset(id)?.drama_id === projectId,
    );
    this.db
      .prepare("DELETE FROM panel_project_assets WHERE panel_id = ?")
      .run(panelId);
    const insert = this.db.prepare(
      "INSERT INTO panel_project_assets (panel_id, project_asset_id) VALUES (?, ?)",
    );
    valid.forEach((assetId) => insert.run(panelId, assetId));
  }

  private validAssetIds(episodeId: number, rawIds: unknown): number[] {
    const episode = this.episode(episodeId);
    if (!episode) return [];
    const ids = Array.isArray(rawIds)
      ? rawIds.map(readNumber).filter((id): id is number => Boolean(id))
      : [];
    return [...new Set(ids)].filter(
      (id) => this.getProjectAsset(id)?.drama_id === episode.drama_id,
    );
  }
}

interface RawProjectAsset
  extends Omit<ProjectAssetRow, "text_profile" | "input_reference_images"> {
  text_profile: string;
  input_reference_images: string;
}

interface RawPanel
  extends Omit<
    PanelRow,
    | "project_asset_ids"
    | "extra_reference_images"
    | "image_recipe_references"
    | "image_needs_review"
    | "recipe_needs_reassembly"
  > {
  extra_reference_images: string;
  image_recipe_references: string;
  image_needs_review: number;
  recipe_needs_reassembly: number;
}

const STORYBOARD_SPECIFICATION_FIELDS = [
  "title",
  "description",
  "action",
  "expression",
  "framing",
  "viewpoint",
  "composition",
  "lighting",
  "mood",
  "image_prompt",
] as const;

function panelSpecificationChanged(
  current: PanelRow,
  body: Record<string, unknown>,
  extraReferences: string[],
  assetIds: number[],
): boolean {
  if (
    STORYBOARD_SPECIFICATION_FIELDS.some(
      (field) =>
        body[field] !== undefined &&
        optionalText(body, field, current[field]) !== current[field],
    )
  )
    return true;
  if (
    body.extra_reference_images !== undefined &&
    !sameStrings(extraReferences, current.extra_reference_images)
  )
    return true;
  return (
    body.project_asset_ids !== undefined &&
    !sameNumbers(assetIds, current.project_asset_ids)
  );
}

function hasCompleteRecipeSnapshot(body: Record<string, unknown>): boolean {
  return (
    body.recipe_reassembled === true &&
    typeof body.image_recipe_prompt === "string" &&
    body.image_recipe_prompt.trim().length > 0
  );
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameNumbers(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function hydrateProjectAsset(row: RawProjectAsset): ProjectAssetRow {
  return {
    ...row,
    text_profile: parseJson<AssetTextProfile>(row.text_profile, {}),
    input_reference_images: parseJson<string[]>(row.input_reference_images, []),
  };
}

function relationIds(db: SQLiteDatabase, panelId: number): number[] {
  return (
    db
      .prepare(
        `
    SELECT project_asset_id AS id
    FROM panel_project_assets
    WHERE panel_id = ?
    ORDER BY project_asset_id
  `,
      )
      .all(panelId) as Array<{ id: number }>
  ).map((item) => item.id);
}

function assetKind(value: unknown): AssetKind {
  if (value === "character" || value === "scene" || value === "prop")
    return value;
  throw new ValidationError("资产类型必须是 character、scene 或 prop");
}

function assetLabel(kind: AssetKind): string {
  return { character: "角色", scene: "场景", prop: "道具" }[kind];
}

export function normalizeTextProfile(
  kind: AssetKind,
  value: unknown,
): AssetTextProfile {
  const source = asRecord(value) ?? {};
  const supported = new Set(PROFILE_FIELDS[kind]);
  const unknown = Object.keys(source).filter((key) => !supported.has(key));
  if (unknown.length)
    throw new ValidationError(
      `${assetLabel(kind)}卡包含不支持的字段：${unknown.join("、")}`,
    );
  const result: AssetTextProfile = {};
  for (const key of PROFILE_FIELDS[kind]) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "string") {
      const cleaned = raw.trim();
      if (cleaned) result[key] = cleaned;
      continue;
    }
    throw new ValidationError(`${assetLabel(kind)}卡字段 ${key} 必须是文本`);
  }
  return result;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function normalizeOutputType(
  kind: AssetKind,
  value: unknown,
): AssetOutputType {
  const outputType = readString(value) ?? DEFAULT_OUTPUT_TYPE[kind];
  if (OUTPUT_TYPES[kind].includes(outputType as AssetOutputType))
    return outputType as AssetOutputType;
  throw new ValidationError(`${assetLabel(kind)}卡产出类型无效`);
}

function outputPromptValue(value: unknown): string {
  if (typeof value !== "string")
    throw new ValidationError("最终生成提示词必须是文本");
  return value;
}

function promptValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string")
    throw new ValidationError("分格最终提示词必须是文本");
  return value;
}

function optionalPrompt(
  body: Record<string, unknown>,
  key: string,
  current: string,
): string {
  return body[key] === undefined ? current : promptValue(body[key]);
}

function textOrNull(value: unknown): string | null {
  return readString(value) ?? null;
}

function optionalText(
  body: Record<string, unknown>,
  key: string,
  current: string | null,
): string | null {
  return body[key] === undefined ? current : textOrNull(body[key]);
}
