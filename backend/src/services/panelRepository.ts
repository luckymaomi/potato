import { NotFoundError, ValidationError } from "../errors";
import type { Logger, SQLiteDatabase } from "../types/core";
import { parseJson, readNumber } from "../types/core";
import type { EpisodeRow, PanelRow, ProjectAssetRow } from "../types/domain";
import {
  asBody,
  normalizeStringArray,
  optionalPrompt,
  optionalText,
  promptValue,
  textOrNull,
} from "./workspaceNormalize";

type AssetLookup = {
  getProjectAsset(id: number): ProjectAssetRow | undefined;
};

export class PanelRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly assets: AssetLookup,
    private readonly log?: Logger,
  ) {}

  getPanel(id: number): PanelRow | undefined {
    const row = this.db.prepare("SELECT * FROM panels WHERE id = ?").get(id) as
      | RawPanel
      | undefined;
    return row ? hydratePanelRow(this.db, row) : undefined;
  }

  listPanels(episodeId: number): PanelRow[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM panels WHERE episode_id = ? ORDER BY panel_number",
      )
      .all(episodeId) as RawPanel[];
    return rows.map((row) => hydratePanelRow(this.db, row));
  }

  episode(id: number): EpisodeRow | undefined {
    return this.db.prepare("SELECT * FROM episodes WHERE id = ?").get(id) as
      | EpisodeRow
      | undefined;
  }

  createPanel(input: unknown): PanelRow {
    const body = asBody(input);
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
        episode_id, panel_number, title, description, action,
        image_prompt, image_recipe_prompt, image_recipe_references, extra_reference_images, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        episodeId,
        number,
        textOrNull(body.title),
        textOrNull(body.description),
        textOrNull(body.action),
        textOrNull(body.image_prompt),
        promptValue(body.image_recipe_prompt, "分镜最终提示词必须是文本"),
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
    if (!current) throw new NotFoundError("分镜不存在");
    const body = asBody(input);
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
      UPDATE panels SET panel_number = ?, title = ?, description = ?, action = ?,
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
        optionalText(body, "image_prompt", current.image_prompt),
        optionalPrompt(
          body,
          "image_recipe_prompt",
          current.image_recipe_prompt,
          "分镜最终提示词必须是文本",
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
        const body = { ...asBody(raw), panel_number: index + 1 };
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
    if (!this.assets.getProjectAsset(assetId))
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
    if (!changed) throw new NotFoundError("分镜不存在");
  }

  confirmPanelReview(panelId: number): PanelRow {
    const changed = this.db
      .prepare(
        `UPDATE panels SET image_needs_review = 0, updated_at = ? WHERE id = ?`,
      )
      .run(new Date().toISOString(), panelId).changes;
    if (!changed) throw new NotFoundError("分镜不存在");
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

  private syncPanelAssets(
    panelId: number,
    projectId: number,
    rawIds: unknown,
  ): void {
    const ids = Array.isArray(rawIds)
      ? rawIds.map(readNumber).filter((id): id is number => Boolean(id))
      : [];
    const valid = [...new Set(ids)].filter(
      (id) => this.assets.getProjectAsset(id)?.drama_id === projectId,
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
      (id) => this.assets.getProjectAsset(id)?.drama_id === episode.drama_id,
    );
  }
}

export interface RawPanel
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

export function hydratePanelRow(db: SQLiteDatabase, row: RawPanel): PanelRow {
  return {
    ...row,
    project_asset_ids: panelAssetRelationIds(db, row.id),
    extra_reference_images: parseJson<string[]>(row.extra_reference_images, []),
    image_recipe_references: parseJson<string[]>(
      row.image_recipe_references,
      [],
    ),
    image_needs_review: Boolean(row.image_needs_review),
    recipe_needs_reassembly: Boolean(row.recipe_needs_reassembly),
  };
}

export function panelAssetRelationIds(
  db: SQLiteDatabase,
  panelId: number,
): number[] {
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

const STORYBOARD_SPECIFICATION_FIELDS = [
  "title",
  "description",
  "action",
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
