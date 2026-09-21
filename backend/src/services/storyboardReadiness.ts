import { ValidationError } from '../errors';
import type { ProjectAssetRow, StoryboardRow } from '../types/domain';

export interface VideoReadiness {
  warning?: string;
}

export function assertStoryboardImageReady(shot: StoryboardRow, assets: ProjectAssetRow[]): void {
  if (shot.recipe_needs_reassembly) throw new ValidationError('镜头配方待重装，请先组装并保存图片与视频配方');
  if (!shot.image_recipe_prompt.trim()) throw new ValidationError('请先组装并保存图片配方');
  if (!shot.project_asset_ids.length) throw new ValidationError('请先为本镜选择至少一项出场资产，再生成分镜图');
  const missing = assets.filter((asset) => (asset.kind === 'character' || asset.kind === 'scene') && !asset.image_url);
  if (missing.length) throw new ValidationError(`请先补齐出场${missing.map((asset) => `${asset.kind === 'character' ? '角色' : '场景'}卡「${asset.name}」`).join('、')}的标准图`);
}

export function assertStoryboardVideoReady(shot: StoryboardRow): VideoReadiness {
  if (shot.recipe_needs_reassembly) throw new ValidationError('镜头配方待重装，请先组装并保存图片与视频配方');
  if (!shot.video_recipe_prompt.trim()) throw new ValidationError('请先组装并保存视频配方');
  if (hasForbiddenVideoFrameLayout(shot.video_recipe_prompt)) throw new ValidationError('视频配方包含九宫格、分屏或多宫格描述，不能用于连续首帧视频');
  if (!shot.video_prompt?.trim() && !shot.camera_movement?.trim() && !shot.action?.trim()) return { warning: '视频主干、运镜和动作均为空，生成结果的运动效果不可预期' };
  return {};
}

export function assertEpisodeReadyForComposition(shots: StoryboardRow[]): void {
  const stale = shots.filter((shot) => shot.video_needs_review).map((shot) => shot.storyboard_number);
  if (stale.length) throw new ValidationError(`整集合成前请复核或重跑待复核视频：${stale.join('、')}`);
}

export function hasForbiddenVideoFrameLayout(prompt: string): boolean {
  return /九\s*宫\s*格|9\s*宫\s*格|多\s*宫\s*格|分\s*屏|多\s*屏/iu.test(prompt);
}
