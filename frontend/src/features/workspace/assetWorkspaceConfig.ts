import type { AssetKind, AssetOutputType, AssetTextProfile } from '../../types/domain'

export type AssetFilter = 'all' | AssetKind

export interface AssetFormValues {
  name?: string
  text_profile?: AssetTextProfile
  output_type?: AssetOutputType
  output_prompt?: string
  input_reference_images?: string[]
}

export interface ProfileField {
  key: string
  label: string
}

export interface ProfileGroup {
  title: string
  fields: ProfileField[]
}

export const assetLabels: Record<AssetKind, string> = { character: '角色卡', scene: '场景卡', prop: '道具卡' }

export const profileGroups: Record<AssetKind, ProfileGroup[]> = {
  character: [
    { title: '身份', fields: [field('age', '年龄'), field('gender', '性别'), field('occupation', '职业'), field('faction', '阵营')] },
    { title: '外形', fields: [field('face_shape', '脸型'), field('facial_features', '五官'), field('hairstyle', '发型'), field('body_type', '体型'), field('skin_tone', '肤色')] },
    { title: '服装与神态', fields: [field('default_outfit', '默认穿搭'), field('personality', '性格'), field('common_expressions', '常见表情'), field('aura', '气场')] },
    { title: '声音', fields: [field('voice_tone_id', '音色 ID'), field('speech_rate', '语速'), field('accent', '口音'), field('signature_phrase', '标志性语气')] },
  ],
  scene: [
    { title: '空间', fields: [field('location_type', '地点类型'), field('layout', '布局'), field('architectural_style', '建筑风格'), field('scale', '尺寸比例')] },
    { title: '光影', fields: [field('time_of_day', '时间段'), field('light_source', '光源'), field('color_temperature', '色温'), field('contrast', '明暗对比')] },
    { title: '陈设', fields: [field('key_furniture', '陈设'), field('props', '道具'), field('decorations', '装饰'), field('vegetation', '植被')] },
    { title: '氛围', fields: [field('palette', '色调'), field('emotion', '情绪'), field('weather', '天气')] },
  ],
  prop: [
    { title: '物理', fields: [field('category', '类别'), field('size', '尺寸'), field('material', '材质'), field('color', '颜色'), field('shape', '形状')] },
    { title: '细节', fields: [field('condition', '新旧程度'), field('special_marks', '特殊标记'), field('unique_design', '独特设计')] },
    { title: '状态', fields: [field('default_state', '默认状态'), field('interaction_states', '互动状态'), field('bindings', '绑定关系')] },
  ],
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

export function profileSummary(profile: AssetTextProfile): string {
  return Object.values(profile).join(' · ')
}

export function parseKindFilter(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}

function field(key: string, label: string): ProfileField {
  return { key, label }
}
