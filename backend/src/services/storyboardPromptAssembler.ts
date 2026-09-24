import type { AssetKind, ProjectAssetRow, PanelRow } from "../types/domain";

export interface PanelRecipe {
  panelRecipe: {
    prompt: string;
    references: string[];
  };
}

export interface StyleLock {
  tone?: string | null;
  reference_setting?: string | null;
}

export interface StoryboardRecipeInput {
  shot: PanelRow;
  assets: ProjectAssetRow[];
  styleLock?: StyleLock;
  previousPanelImage?: string | null;
}

const PROFILE_FIELDS: Record<
  AssetKind,
  ReadonlyArray<readonly [string, string]>
> = {
  character: [
    ["age", "年龄"],
    ["gender", "性别"],
    ["occupation", "职业"],
    ["faction", "阵营"],
    ["face_shape", "脸型"],
    ["facial_features", "五官"],
    ["hairstyle", "发型"],
    ["body_type", "体型"],
    ["skin_tone", "肤色"],
    ["default_outfit", "默认穿搭"],
    ["personality", "性格"],
    ["common_expressions", "常见表情"],
    ["aura", "气场"],
  ],
  scene: [
    ["location_type", "地点类型"],
    ["layout", "布局"],
    ["architectural_style", "建筑风格"],
    ["scale", "尺寸比例"],
    ["time_of_day", "时间段"],
    ["light_source", "光源"],
    ["color_temperature", "色温"],
    ["contrast", "明暗对比"],
    ["key_furniture", "关键家具"],
    ["props", "道具"],
    ["decorations", "装饰"],
    ["vegetation", "植被"],
    ["palette", "色调"],
    ["emotion", "情绪"],
    ["weather", "天气"],
  ],
  prop: [
    ["category", "类别"],
    ["size", "尺寸"],
    ["material", "材质"],
    ["color", "颜色"],
    ["shape", "形状"],
    ["condition", "新旧程度"],
    ["special_marks", "特殊标记"],
    ["unique_design", "独特设计"],
    ["default_state", "默认状态"],
    ["interaction_states", "互动状态"],
    ["bindings", "绑定关系"],
  ],
};

export function assemblePanelRecipe({
  shot,
  assets,
  styleLock,
  previousPanelImage,
}: StoryboardRecipeInput): PanelRecipe {
  const selectedAssets = assets.filter((asset) =>
    shot.project_asset_ids.includes(asset.id),
  );
  const assetBlocks = selectedAssets.map(compileAssetTextBlock);
  const references = unique([
    ...selectedAssets.map((asset) => asset.image_url),
    ...shot.extra_reference_images,
    previousPanelImage,
  ]);
  const beat =
    clean(shot.action) ||
    clean(shot.description) ||
    clean(shot.image_prompt) ||
    clean(shot.title);
  const imagePrompt = joinBlocks([
    field("基调", styleLock?.tone),
    field("参考设定", styleLock?.reference_setting),
    beat,
    ...assetBlocks,
    field("取景", shot.framing),
    field("构图", shot.composition),
    field("视角", shot.viewpoint),
    field("表情", shot.expression),
    field("光线", shot.lighting),
    field("氛围", shot.mood),
    "干净画面；无字幕、无气泡、无水印",
  ]);
  return { panelRecipe: { prompt: imagePrompt, references: [...references] } };
}

/** @deprecated Use assemblePanelRecipe. */
export function assembleStoryboardRecipes(
  input: StoryboardRecipeInput,
): PanelRecipe {
  return assemblePanelRecipe(input);
}

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

function field(label: string, value: string | null | undefined): string {
  const text = clean(value);
  return text ? `${label}：${text}` : "";
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
