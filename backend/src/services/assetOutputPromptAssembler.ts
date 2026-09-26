import type { AssetKind, AssetOutputType, ProjectAssetRow } from '../types/domain';
import { compileAssetTextBlock } from './storyboardPromptAssembler';
import { ValidationError } from '../errors';

/** 图片参考锁定：未选不组装；选中则按类型写入锁脸/锁景/锁物。 */
export type ReferenceLockKind = 'face' | 'scene' | 'prop';

/** 画面禁字：未选不组装；选中则写入禁止出字约束。 */
export type ImageTextBanKind = 'ban';

export type AssetOutputPromptSource = Pick<ProjectAssetRow, 'kind' | 'name' | 'text_profile' | 'output_type'> & {
  reference_lock?: ReferenceLockKind | null;
  ban_image_text?: ImageTextBanKind | null;
};

const OUTPUT_INSTRUCTIONS: Record<AssetOutputType, string> = {
  'character-layout-a': '产出布局 A（三栏三视图）：左栏为无头全身正面站姿立绘；中栏为无头全身背面站姿立绘；右栏为大比例面部五官头部正侧特写。',
  'character-layout-b': '产出布局 B（左脸右身）：左侧为正脸特写，包含头部与肩部并锁定五官与发型；右侧为正面、90度侧面、背面三张等高全身视图，头顶与脚底对齐。',
  'character-layout-c': '产出布局 C（4+3 双层）：第一排为正面、左侧面、右侧面、背面四张全身图；第二排为正面、左侧面、右侧面三张头部特写。',
  'character-layout-d': '产出布局 D（7 图身份锚点组）：正面肖像、四分之三侧面、纯侧面、全身、中性表情、微笑表情、手部特写。',
  'scene-panorama': '产出空间全景图：使用宽幅构图，清楚呈现整体布局、空间关系、建筑风格、尺度和氛围，保持透视结构可供后续分镜复用。',
  'scene-detail': '产出局部特写图：聚焦本卡关键陈设、材质、装饰和光影细节，保持与场景空间、建筑风格和色调一致。',
  'scene-lighting-variant': '产出光影变体卡：当前场景卡具有独立 ID，只表达文本结构指定的一种光影设定；清楚呈现光源、色温、明暗对比和时间氛围。',
  'prop-multi-angle': '产出多角度图：同一道具包含正面、侧面和局部特写，清楚呈现尺寸、材质、颜色、形状、特殊标记与默认状态。',
  'prop-state-variant': '产出状态变体卡：当前道具卡具有独立 ID，只表达文本结构指定的一种道具状态；清楚呈现该状态的形态、材质、特殊标记和可辨识细节。',
};

const REFERENCE_LOCK_TEXT: Record<ReferenceLockKind, string> = {
  face:
    '图片参考锁定（锁脸）：以我上传的参考图为唯一面部身份锚点，img2img 图生图。严格保持参考图中人物的同一张脸：脸型、额头、颧骨、下颌、眉形、眼型、鼻型、唇形、发际线与发型轮廓一致。',
  scene:
    '图片参考锁定（锁景）：以我上传的参考图为唯一场景锚点，img2img 图生图。严格保持参考图中的空间结构、建筑风格、尺度关系、关键陈设相对位置与色调一致。',
  prop:
    '图片参考锁定（锁物）：以我上传的参考图为唯一道具锚点，img2img 图生图。严格保持参考图中道具的外形轮廓、比例、材质、颜色与特殊标记一致。',
};

const BAN_IMAGE_TEXT =
  '画面约束（禁止出字）：图像中不得出现任何文字、字母、数字、字幕、水印、招牌字、标签、气泡或其它可读字符；保持纯视觉画面。';

const LOCK_FOR_ASSET_KIND: Record<AssetKind, ReferenceLockKind> = {
  character: 'face',
  scene: 'scene',
  prop: 'prop',
};

export function normalizeReferenceLock(kind: AssetKind, value: unknown): ReferenceLockKind | null {
  if (value === null || value === undefined || value === '') return null;
  const expected = LOCK_FOR_ASSET_KIND[kind];
  if (value === expected || value === 'on' || value === true) return expected;
  // 兼容误传其它 lock 名：仍按当前资产类型纠正
  if (value === 'face' || value === 'scene' || value === 'prop') {
    if (value !== expected) {
      throw new ValidationError(`当前${kind === 'character' ? '角色' : kind === 'scene' ? '场景' : '道具'}卡只能选择${expected === 'face' ? '锁脸' : expected === 'scene' ? '锁景' : '锁物'}`);
    }
    return value;
  }
  throw new ValidationError('图片参考锁定选项无效');
}

export function normalizeBanImageText(value: unknown): ImageTextBanKind | null {
  if (value === null || value === undefined || value === '') return null;
  if (value === 'ban' || value === 'on' || value === true) return 'ban';
  throw new ValidationError('画面禁字选项无效');
}

export function assembleAssetOutputPrompt(asset: AssetOutputPromptSource): string {
  const lock = normalizeReferenceLock(asset.kind, asset.reference_lock);
  const banText = normalizeBanImageText(asset.ban_image_text);
  return [
    lock ? REFERENCE_LOCK_TEXT[lock] : '',
    banText ? BAN_IMAGE_TEXT : '',
    compileAssetTextBlock(asset),
    OUTPUT_INSTRUCTIONS[asset.output_type],
  ].filter((part) => part.trim().length > 0).join('\n');
}
