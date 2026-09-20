import type { AssetOutputType, ProjectAssetRow } from '../types/domain';
import { compileAssetTextBlock } from './storyboardPromptAssembler';

const OUTPUT_INSTRUCTIONS: Record<AssetOutputType, string> = {
  'character-layout-a': '产出布局 A（三栏三视图）：左栏为无头全身正面站姿立绘；中栏为无头全身背面站姿立绘；右栏为大比例面部五官头部正侧特写。',
  'character-layout-b': '产出布局 B（左脸右身）：左侧为正脸特写，包含头部与肩部并锁定五官与发型；右侧为正面、90度侧面、背面三张等高全身视图，头顶与脚底对齐。',
  'character-layout-c': '产出布局 C（4+3 双层）：第一排为正面、左侧面、右侧面、背面四张全身图；第二排为正面、左侧面、右侧面三张头部特写。',
  'character-layout-d': '产出布局 D（7 图身份锚点组）：正面肖像、四分之三侧面、纯侧面、全身、中性表情、微笑表情、手部特写。',
  'scene-panorama': '产出空间全景图：使用宽幅构图，清楚呈现整体布局、空间关系、建筑风格、尺度和氛围，保持透视结构可供后续镜头复用。',
  'scene-detail': '产出局部特写图：聚焦本卡关键陈设、材质、装饰和光影细节，保持与场景空间、建筑风格和色调一致。',
  'scene-lighting-variant': '产出光影变体卡：当前场景卡具有独立 ID，只表达文本结构指定的一种光影设定；清楚呈现光源、色温、明暗对比和时间氛围。',
  'prop-multi-angle': '产出多角度图：同一道具包含正面、侧面和局部特写，清楚呈现尺寸、材质、颜色、形状、特殊标记与默认状态。',
  'prop-state-variant': '产出状态变体卡：当前道具卡具有独立 ID，只表达文本结构指定的一种道具状态；清楚呈现该状态的形态、材质、特殊标记和可辨识细节。',
};

const CHARACTER_CONSISTENCY = '角色一致性约束：所有视图必须是同一人物、同一张脸、同一发型、同一服装；身高比例和五官完全一致；使用纯色或中性背景，背景不得干扰人物辨识。';
const SCENE_CONSISTENCY = '场景一致性约束：画面不出现角色，空间结构、尺度、建筑风格、陈设位置和色调必须与本卡文本一致。';
const PROP_CONSISTENCY = '道具一致性约束：画面不出现无关物体，所有视图的尺寸比例、材质、颜色、形状和特殊标记必须一致，使用纯色或中性背景。';

export function assembleAssetOutputPrompt(asset: ProjectAssetRow): string {
  return [
    compileAssetTextBlock(asset),
    OUTPUT_INSTRUCTIONS[asset.output_type],
    consistencyInstruction(asset),
  ].join('\n');
}

function consistencyInstruction(asset: ProjectAssetRow): string {
  if (asset.kind === 'character') return CHARACTER_CONSISTENCY;
  if (asset.kind === 'scene') return SCENE_CONSISTENCY;
  return PROP_CONSISTENCY;
}
