import type { ProjectAssetRow, StoryboardRow } from '../types/domain';

export interface StoryboardPromptAssembly {
  imagePrompt: string;
  videoPrompt: string;
  imageReferences: string[];
  videoReferences: string[];
  imageNegativePrompt?: string;
}

export interface StoryboardPromptAssemblyInput {
  shot: StoryboardRow;
  assets: ProjectAssetRow[];
  imagePromptOverride?: string;
  videoPromptOverride?: string;
  storyboardImageUrl?: string;
}

/**
 * The only owner of storyboard-to-media prompt assembly.
 * Keep image references separate from semantic prompt text so providers can
 * enforce their own reference-image contracts.
 */
export function assembleStoryboardPrompts(input: StoryboardPromptAssemblyInput): StoryboardPromptAssembly {
  const { shot } = input;
  const assets = input.assets.filter((asset) => shot.project_asset_ids.includes(asset.id));
  const assetBlocks = assets.map((asset) => `${assetLabel(asset.kind)}「${asset.name}」：${assetText(asset)}`);
  const imageBlocks = [
    field('剧情', shot.description ?? undefined),
    field('景别', shot.shot_size),
    field('机位', shot.camera_angle),
    field('构图', shot.composition),
    field('动作', shot.action ?? undefined),
    field('对白语义（画面不要生成文字）', shot.dialogue ?? undefined),
    field('光线', shot.lighting),
    field('氛围', shot.mood),
  ];
  const videoBlocks = [
    ...imageBlocks,
    field('运镜', shot.camera_movement),
    field('声音', shot.sound),
  ];
  const imagePrompt = joinPrompt([
    (input.imagePromptOverride || shot.image_prompt || shot.description || shot.title) ?? undefined,
    assetBlocks.length ? `资产参考：\n${assetBlocks.join('\n')}` : undefined,
    ...imageBlocks,
  ]);
  const videoPrompt = joinPrompt([
    (input.videoPromptOverride || shot.video_prompt || shot.description || shot.title) ?? undefined,
    assetBlocks.length ? `资产语义：\n${assetBlocks.join('\n')}` : undefined,
    ...videoBlocks,
  ]);
  const imageReferences = unique(assets.map((asset) => asset.image_url).filter((value): value is string => Boolean(value)));
  const videoReferences = unique([input.storyboardImageUrl].filter((value): value is string => Boolean(value)));
  return {
    imagePrompt,
    videoPrompt,
    imageReferences,
    videoReferences,
    ...(clean(shot.negative_prompt) ? { imageNegativePrompt: clean(shot.negative_prompt) } : {}),
  };
}

function field(label: string, value: string | null | undefined): string | undefined {
  const text = clean(value);
  return text ? `${label}：${text}` : undefined;
}

function joinPrompt(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(clean(part))).map((part) => part.trim()).join('\n');
}

function assetText(asset: ProjectAssetRow): string {
  return clean(asset.prompt) || clean(asset.appearance) || clean(asset.visual_description) || clean(asset.description) || asset.name;
}

function assetLabel(kind: ProjectAssetRow['kind']): string {
  return kind === 'character' ? '人物' : kind === 'scene' ? '场景' : '道具';
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
