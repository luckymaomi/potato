import { NotFoundError, ValidationError } from "../errors";
import type { Logger, SQLiteDatabase } from "../types/core";
import { parseJson, readString } from "../types/core";
import type {
  AssetKind,
  AssetOutputType,
  AssetTextProfile,
  ProjectAssetRow,
} from "../types/domain";
import { asBody, normalizeStringArray } from "./workspaceNormalize";

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

export class ProjectAssetRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly log?: Logger,
    private readonly onAssetTextOrPromptChanged?: (assetId: number) => void,
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
    const body = asBody(input);
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
    const body = asBody(input);
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
      this.onAssetTextOrPromptChanged?.(id);
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

  private requireProject(projectId: number): void {
    if (!this.db.prepare("SELECT id FROM dramas WHERE id = ?").get(projectId))
      throw new NotFoundError("项目不存在");
  }
}

export interface RawProjectAsset
  extends Omit<ProjectAssetRow, "text_profile" | "input_reference_images"> {
  text_profile: string;
  input_reference_images: string;
}

export function hydrateProjectAsset(row: RawProjectAsset): ProjectAssetRow {
  return {
    ...row,
    text_profile: parseJson<AssetTextProfile>(row.text_profile, {}),
    input_reference_images: parseJson<string[]>(row.input_reference_images, []),
  };
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
  const source = asBody(value);
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
