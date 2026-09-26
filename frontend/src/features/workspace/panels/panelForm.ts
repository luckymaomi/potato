import type { AssetKind, Panel, ProjectAsset } from "../../../types/domain";

export interface PanelFormValues extends Partial<Panel> {
  character_asset_ids?: number[];
  scene_asset_ids?: number[];
  prop_asset_ids?: number[];
  aspect_ratio?: string | null;
}

export const assetLabels: Record<AssetKind, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

export function panelPayload(values: PanelFormValues): Partial<Panel> {
  const {
    character_asset_ids,
    scene_asset_ids,
    prop_asset_ids,
    aspect_ratio: _aspect,
    ...rest
  } = values;
  return {
    ...rest,
    project_asset_ids: [
      ...(character_asset_ids ?? []),
      ...(scene_asset_ids ?? []),
      ...(prop_asset_ids ?? []),
    ],
  };
}

export function filterAssetIds(
  ids: number[] | undefined,
  assets: ProjectAsset[],
  kind: AssetKind,
): number[] {
  return (ids ?? []).filter((id) =>
    assets.some((asset) => asset.id === id && asset.kind === kind),
  );
}
