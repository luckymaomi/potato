import type { AssetKind, AssetOutputType, AssetTextProfile, ImageTextBanKind, ReferenceLockKind } from '../../types/domain'

export type AssetFilter = 'all' | AssetKind

export interface AssetFormValues {
  name?: string
  text_profile?: AssetTextProfile
  output_type?: AssetOutputType
  reference_lock?: ReferenceLockKind | null
  ban_image_text?: ImageTextBanKind | null
  output_prompt?: string
  input_reference_images?: string[]
  aspect_ratio?: string
}

/** 资产资料唯一文本键：各类卡都只存一段 brief。 */
export const PROFILE_BRIEF_KEY = 'brief' as const

export const assetLabels: Record<AssetKind, string> = { character: '角色卡', scene: '场景卡', prop: '道具卡' }

export const briefPlaceholders: Record<AssetKind, string> = {
  character:
    '年龄：成年\n性别：女\n外形：鹅蛋脸、黑长发、暖白肤色…\n服装：象牙白薄巾松绕胸下至大腿中段…\n表情：回眸浅笑、红唇轻启…',
  scene:
    '地点：王室私人浴室\n空间外观：大理石浴池、金线石柱…\n光影：暖琥珀壁灯、蒸汽体积光…\n氛围：私密安静奢华…',
  prop:
    '外形：象牙白厚实棉浴巾…\n细节：一角小金纹章…\n状态：叠放石台作背景陈设…',
}

export const briefLabels: Record<AssetKind, string> = {
  character: '角色视觉描述',
  scene: '场景视觉描述',
  prop: '道具视觉描述',
}

const BRIEF_COPY_SPECS: Record<
  AssetKind,
  { cover: string; sample: string }
> = {
  character: {
    cover:
      '年龄、性别、外形（脸型、五官、发型、体型、肤色等）、服装（写清衣物覆盖到哪里、材质与松紧）、表情与气质',
    sample: [
      '年龄：成年',
      '性别：女',
      '外形：精致鹅蛋脸，黑长发浴后微湿贴肩，暖白肤色',
      '服装：象牙白薄巾松绕，上沿压锁骨下方，下摆至大腿中段',
      '表情：回眸浅笑、红唇轻启',
    ].join('\n'),
  },
  scene: {
    cover: '地点、空间外观与布局、光影（光源、色温、明暗）、氛围（情绪、天气或湿度、色调）',
    sample: [
      '地点：王室私人浴室',
      '空间外观：中央大理石浴池，古典石柱与金线嵌边，私密中型空间',
      '光影：暖琥珀壁灯，蒸汽散射体积光',
      '氛围：私密安静奢华，高湿蒸汽',
    ].join('\n'),
  },
  prop: {
    cover: '外形（类别、尺寸、材质、颜色、形状）、细节（标记、纹样、新旧）、状态（默认摆放或使用中形态）',
    sample: [
      '外形：成人用大浴巾，厚实棉质，象牙白近纯白，长方形',
      '细节：一角细小金色纹章，宽幅褶皱自然',
      '状态：叠放在石台上作背景陈设，干净干燥备用',
    ].join('\n'),
  },
}

/** 复制给其他 AI：写作说明 + 分条输出样例 + 当前草稿。 */
export function briefCopyLead(kind: AssetKind, name: string): string {
  const cardLabel = assetLabels[kind]
  const { cover, sample } = BRIEF_COPY_SPECS[kind]
  const assetName = name.trim() || '（未命名）'
  return [
    `请为漫画项目的「${cardLabel}」写一份可直接复制粘贴回资产台的视觉描述提示词。`,
    `资产名称：${assetName}`,
    `需要尽量写全（不是死板填空，但应覆盖）：${cover}。`,
    '输出格式：分条输出，每行「标签：内容」；编号可有可无；不要解释过程，不要寒暄。',
    '输出样例：',
    sample,
    '当前草稿（可在此基础上改写，也可重写）：',
  ].join('\n')
}

export function buildBriefCopyText(kind: AssetKind, name: string, brief: string): string {
  const draft = brief.trim() || '（空）'
  return `${briefCopyLead(kind, name)}\n${draft}`
}

export const outputTypeOptions: Record<AssetKind, Array<{ value: AssetOutputType; label: string }>> = {
  character: [
    { value: 'character-layout-a', label: 'A 三栏三视图' },
    { value: 'character-layout-b', label: 'B 左脸右身' },
    { value: 'character-layout-c', label: 'C 4+3 双层' },
    { value: 'character-layout-d', label: 'D 7 图锚点组' },
  ],
  scene: [
    { value: 'scene-panorama', label: '空间全景' },
    { value: 'scene-detail', label: '局部特写' },
    { value: 'scene-lighting-variant', label: '光影变体' },
  ],
  prop: [
    { value: 'prop-multi-angle', label: '多角度' },
    { value: 'prop-state-variant', label: '状态变体' },
  ],
}

/** 与预设模板同为下拉：不选则组装不含锁定段；选中则写入对应文案。 */
export const referenceLockOptions: Record<AssetKind, Array<{ value: ReferenceLockKind; label: string }>> = {
  character: [{ value: 'face', label: '锁脸' }],
  scene: [{ value: 'scene', label: '锁景' }],
  prop: [{ value: 'prop', label: '锁物' }],
}

/** 三类资产共用：不选则组装不含禁字段；选中后点组装才写入。 */
export const banImageTextOptions: Array<{ value: ImageTextBanKind; label: string }> = [
  { value: 'ban', label: '禁止出字' },
]

export function profileSummary(profile: AssetTextProfile): string {
  return (profile[PROFILE_BRIEF_KEY] ?? '').trim()
}

export function parseKindFilter(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}
