import type { AssetKind, ProjectAssetRow, PanelRow } from "../types/domain";

export interface PanelRecipe {
  panelRecipe: {
    prompt: string;
    references: string[];
  };
}

export interface StoryboardRecipeInput {
  shot: PanelRow;
  assets: ProjectAssetRow[];
}

const PROFILE_FIELDS: Record<
  AssetKind,
  ReadonlyArray<readonly [string, string]>
> = {
  character: [["brief", "视觉描述"]],
  scene: [["brief", "视觉描述"]],
  prop: [["brief", "视觉描述"]],
};

/** 分镜组装：文本只拼本镜画面；参考图只挂出场资产标准图与其他参考图。不注入总览画风锁、资产档案或资产出图提示词。 */
export function assemblePanelRecipe({
  shot,
  assets,
}: StoryboardRecipeInput): PanelRecipe {
  const selectedAssets = assets.filter((asset) =>
    shot.project_asset_ids.includes(asset.id),
  );
  const references = unique([
    ...selectedAssets.map((asset) => asset.image_url),
    ...shot.extra_reference_images,
  ]);
  const beat =
    clean(shot.action) ||
    clean(shot.description) ||
    clean(shot.image_prompt) ||
    clean(shot.title);
  const imagePrompt = joinBlocks([
    beat,
    "干净画面；无字幕、无气泡、无水印",
  ]);
  return { panelRecipe: { prompt: imagePrompt, references: [...references] } };
}

/** 资产台组装提示词用的卡面文本块；分镜组装不再注入此段。 */
export function compileAssetTextBlock(
  asset: Pick<ProjectAssetRow, "kind" | "name" | "text_profile">,
): string {
  const fields = PROFILE_FIELDS[asset.kind].flatMap(([key, label]) => {
    const raw = asset.text_profile[key];
    const value = clean(raw);
    return value ? [`${label}：${value}`] : [];
  });
  const prefix = `${assetLabel(asset.kind)}卡「${asset.name}」`;
  return fields.length ? `${prefix}：${fields.join("；")}` : prefix;
}

function joinBlocks(values: Array<string | null | undefined>): string {
  return values.map(clean).filter(Boolean).join("\n");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function assetLabel(kind: AssetKind): string {
  return { character: "角色", scene: "场景", prop: "道具" }[kind];
}
