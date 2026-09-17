export type ProductionMaterial = 'text' | 'image' | 'video'
export type AssetKind = 'character' | 'scene' | 'prop'
export type TextMode = 'manual' | 'ai'
export type MediaGenerationMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
export type TextAction =
  | 'generate-text'
  | 'write-script'
  | 'extract-characters'
  | 'extract-scenes'
  | 'extract-props'
  | 'split-storyboards'
export type ProductionRole =
  | 'story'
  | 'script'
  | 'character-extraction'
  | 'scene-extraction'
  | 'prop-extraction'
  | 'character-asset'
  | 'scene-asset'
  | 'prop-asset'
  | 'storyboard-plan'
  | 'storyboard-image'
  | 'shot-video'
  | 'generic-text'
  | 'generic-image'
  | 'generic-video'

export type ProductionNodeStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface ProductionNodeData extends Record<string, unknown> {
  role: ProductionRole
  title?: string
  prompt?: string
  text?: string
  textMode?: TextMode
  textAction?: TextAction
  generationMode?: MediaGenerationMode
  systemPrompt?: string
  linkedRecordId?: number
  linkedRecordIds?: number[]
  linkedRecordIndex?: number
  episodeId?: number
  outputUrl?: string
  referenceImages?: string[]
  status?: ProductionNodeStatus
  taskId?: string
  error?: string
  provider?: string
  model?: string
  duration?: number
  storyboardCount?: number
  aspectRatio?: string
}

export interface ProductionRoleDefinition {
  role: ProductionRole
  label: string
  description: string
  material: ProductionMaterial
  stage: 'story' | 'script' | 'assets' | 'storyboard' | 'shot' | 'utility'
  assetKind?: AssetKind
  textAction?: TextAction
  defaultTextMode?: TextMode
  defaultGenerationMode?: MediaGenerationMode
}

export const productionRoles: readonly ProductionRoleDefinition[] = [
  { role: 'story', label: '故事想法', description: '一句话梗概、主题和创作要求', material: 'text', stage: 'story', defaultTextMode: 'manual' },
  { role: 'script', label: '剧本', description: '把故事写成场次、动作和对白', material: 'text', stage: 'script', textAction: 'write-script', defaultTextMode: 'ai' },
  { role: 'character-extraction', label: '提取角色', description: '从剧本整理需要保持一致的角色', material: 'text', stage: 'assets', assetKind: 'character', textAction: 'extract-characters', defaultTextMode: 'ai' },
  { role: 'scene-extraction', label: '提取场景', description: '从剧本整理反复出现的拍摄场景', material: 'text', stage: 'assets', assetKind: 'scene', textAction: 'extract-scenes', defaultTextMode: 'ai' },
  { role: 'prop-extraction', label: '提取道具', description: '从剧本整理关键道具和外观要求', material: 'text', stage: 'assets', assetKind: 'prop', textAction: 'extract-props', defaultTextMode: 'ai' },
  { role: 'character-asset', label: '角色资产图', description: '跨镜头复用的角色标准图', material: 'image', stage: 'assets', assetKind: 'character', defaultGenerationMode: 'text-to-image' },
  { role: 'scene-asset', label: '场景资产图', description: '跨镜头复用的场景标准图', material: 'image', stage: 'assets', assetKind: 'scene', defaultGenerationMode: 'text-to-image' },
  { role: 'prop-asset', label: '道具资产图', description: '跨镜头复用的道具标准图', material: 'image', stage: 'assets', assetKind: 'prop', defaultGenerationMode: 'text-to-image' },
  { role: 'storyboard-plan', label: '分镜清单', description: '把剧本拆成一个个可拍摄镜头', material: 'text', stage: 'storyboard', textAction: 'split-storyboards', defaultTextMode: 'ai' },
  { role: 'storyboard-image', label: '分镜图', description: '参考资产图生成某个镜头的画面', material: 'image', stage: 'storyboard', defaultGenerationMode: 'image-to-image' },
  { role: 'shot-video', label: '镜头视频', description: '让一张分镜图变成几秒视频', material: 'video', stage: 'shot', defaultGenerationMode: 'image-to-video' },
  { role: 'generic-text', label: '通用文本', description: '手动文本或选配文本 API', material: 'text', stage: 'utility', textAction: 'generate-text', defaultTextMode: 'manual' },
  { role: 'generic-image', label: '通用图片', description: '自由使用文生图或图生图', material: 'image', stage: 'utility', defaultGenerationMode: 'text-to-image' },
  { role: 'generic-video', label: '通用视频', description: '自由使用文生视频或图生视频', material: 'video', stage: 'utility', defaultGenerationMode: 'text-to-video' },
] as const

const rolesById = new Map(productionRoles.map((definition) => [definition.role, definition]))

export function productionRole(role: ProductionRole): ProductionRoleDefinition {
  const definition = rolesById.get(role)
  if (!definition) throw new Error(`未知生产节点角色：${role}`)
  return definition
}

export function createProductionNodeData(
  role: ProductionRole,
  overrides: Partial<ProductionNodeData> = {},
): ProductionNodeData {
  const definition = productionRole(role)
  const defaults: ProductionNodeData = {
    role,
    title: definition.label,
    status: 'idle',
    ...(definition.material === 'text'
      ? {
          text: '',
          textMode: definition.defaultTextMode,
          ...(role === 'generic-text' ? { textAction: definition.textAction } : {}),
        }
      : {
          prompt: '',
          generationMode: definition.defaultGenerationMode,
          aspectRatio: '9:16',
          ...(definition.material === 'video' ? { duration: 5 } : {}),
        }),
  }
  return { ...defaults, ...overrides, role }
}

export function materialOf(data: Pick<ProductionNodeData, 'role'>): ProductionMaterial {
  return productionRole(data.role).material
}

export function assetKindOf(data: Pick<ProductionNodeData, 'role'>): AssetKind | undefined {
  return productionRole(data.role).assetKind
}

export function textActionOf(data: Pick<ProductionNodeData, 'role' | 'textAction'>): TextAction {
  const definition = productionRole(data.role)
  return data.role === 'generic-text'
    ? data.textAction ?? definition.textAction ?? 'generate-text'
    : definition.textAction ?? 'generate-text'
}

export function roleLabel(data: Pick<ProductionNodeData, 'role'>): string {
  return productionRole(data.role).label
}

export function materialLabel(material: ProductionMaterial): string {
  return { text: '文本材料', image: '图片材料', video: '视频材料' }[material]
}

export function assetKindLabel(kind: AssetKind | undefined): string {
  return kind ? { character: '角色', scene: '场景', prop: '道具' }[kind] : ''
}

export function productionStatusLabel(status: ProductionNodeStatus | undefined): string {
  return {
    idle: '未运行',
    pending: '排队中',
    processing: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已停止',
  }[status ?? 'idle']
}

export const textActionOptions: ReadonlyArray<{ value: TextAction; label: string }> = [
  { value: 'generate-text', label: '通用文本生成' },
  { value: 'write-script', label: '把故事写成剧本' },
  { value: 'extract-characters', label: '从剧本提取角色' },
  { value: 'extract-scenes', label: '从剧本提取场景' },
  { value: 'extract-props', label: '从剧本提取道具' },
  { value: 'split-storyboards', label: '把剧本拆成分镜清单' },
]
