import type { ProductionCommand } from '../../api/production'
import type { Project } from '../../types/domain'

export type ProductionMaterial = 'text' | 'image' | 'video'
export type AssetKind = 'character' | 'scene' | 'prop'
export type TextMode = 'manual' | 'ai'
export type MediaGenerationMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
export type ProductionMethod = 'manual-text' | 'ai-text' | MediaGenerationMode | 'compose'
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
  | 'episode-compose'
  | 'generic-image'
  | 'generic-video'

export type ProductionNodeStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type AssetReferenceKind = 'episodes' | 'characters' | 'scenes' | 'props' | 'storyboards'
export type ContextKind = 'story' | 'script' | 'text' | 'episodes' | 'characters' | 'scenes' | 'props' | 'storyboards' | 'image' | 'storyboard-image' | 'shot-videos'

export interface AssetReferences {
  episodes?: number[]
  characters?: number[]
  scenes?: number[]
  props?: number[]
  storyboards?: number[]
}

export interface ProductionNodeParameters {
  method?: ProductionMethod
  text?: string
  prompt?: string
  systemPrompt?: string
  referenceImages?: string[]
  provider?: string
  model?: string
  duration?: number
  storyboardCount?: number
  aspectRatio?: string
  assetIndex?: number
  episodeId?: number
}

export interface ProductionNodeResult {
  text?: string
  outputUrl?: string
  provider?: string
  model?: string
  assetRefs?: AssetReferences
  taskId?: string
  generationId?: number
  localPath?: string
  mediaAvailable?: boolean
  createdAt?: string
}

export interface ProductionExecution {
  progress?: number
  message: string
  startedAt?: string
  finishedAt?: string
}

export interface ProductionNodeData extends Record<string, unknown> {
  role: ProductionRole
  title?: string
  parameters: ProductionNodeParameters
  assetRefs: AssetReferences
  result: ProductionNodeResult
  history?: ProductionNodeResult[]
  status: ProductionNodeStatus
  manuallyCompleted?: boolean
  execution?: ProductionExecution
  error?: string
}

export interface ContextRequirement {
  kind: ContextKind
  source: 'upstream'
  required: boolean
  multiple?: boolean
}

export interface ProductionOutput {
  kind: ContextKind
  multiple?: boolean
}

export interface PluginParameterDefinition {
  key: keyof ProductionNodeParameters
  label: string
  control: 'method' | 'textarea' | 'prompt' | 'provider-model' | 'integer' | 'aspect-ratio' | 'reference-images' | 'episode'
}

export interface ResolvedProductionContext {
  values: Partial<Record<'story' | 'script' | 'text', string>>
  texts: string[]
  images: string[]
  videos: string[]
  assetRefs: AssetReferences
}

export interface BuildCommandInput {
  project: Project
  data: ProductionNodeData
  context: ResolvedProductionContext
}

export interface ProductionPlugin {
  role: ProductionRole
  label: string
  description: string
  material: ProductionMaterial
  purpose: string
  stage: 'story' | 'script' | 'assets' | 'storyboard' | 'shot' | 'compose' | 'utility'
  inputs: readonly ContextRequirement[]
  outputs: readonly ProductionOutput[]
  parameters: readonly PluginParameterDefinition[]
  defaultParameters: ProductionNodeParameters
  defaultMethod: ProductionMethod
  methods: readonly ProductionMethod[]
  promptKey?: TextAction
  targetAsset?: AssetKind | 'storyboard'
  outputAssets?: AssetReferenceKind
  resultCollection?: { key: 'characters' | 'scenes' | 'props' | 'storyboards'; fields: string[] }
  buildCommand: (input: BuildCommandInput) => ProductionCommand
}

const textParameters: readonly PluginParameterDefinition[] = [
  { key: 'method', label: '内容方式', control: 'method' },
  { key: 'systemPrompt', label: '系统提示词', control: 'textarea' },
  { key: 'provider', label: '文本模型', control: 'provider-model' },
  { key: 'text', label: '文本内容', control: 'textarea' },
]
const imageParameters: readonly PluginParameterDefinition[] = [
  { key: 'method', label: '生成方式', control: 'method' },
  { key: 'prompt', label: '提示词', control: 'prompt' },
  { key: 'referenceImages', label: '补充参考图', control: 'reference-images' },
  { key: 'provider', label: '图片模型', control: 'provider-model' },
  { key: 'aspectRatio', label: '生成画幅', control: 'aspect-ratio' },
]
const videoParameters: readonly PluginParameterDefinition[] = [
  { key: 'method', label: '生成方式', control: 'method' },
  { key: 'prompt', label: '提示词', control: 'prompt' },
  { key: 'referenceImages', label: '补充参考图', control: 'reference-images' },
  { key: 'provider', label: '视频模型', control: 'provider-model' },
  { key: 'duration', label: '时长', control: 'integer' },
  { key: 'aspectRatio', label: '生成画幅', control: 'aspect-ratio' },
]

const storyPlugin: ProductionPlugin = {
  role: 'story', label: '故事想法', description: '一句话梗概、主题和创作要求', material: 'text', purpose: '建立短剧故事输入', stage: 'story',
  inputs: [], outputs: [{ kind: 'story' }, { kind: 'text' }], parameters: textParameters,
  defaultParameters: { method: 'manual-text', text: '' }, defaultMethod: 'manual-text', methods: ['manual-text', 'ai-text'], promptKey: 'generate-text',
  buildCommand: ({ project, data }) => data.parameters.method === 'ai-text'
    ? { kind: 'ai-text', project_id: project.id, source_text: requiredText(data.parameters.text, '请填写故事提示词'), action: 'generate-text', system_prompt: data.parameters.systemPrompt, provider: data.parameters.provider, model: data.parameters.model }
    : { kind: 'manual-text', project_id: project.id, text: requiredText(data.parameters.text, '请填写故事'), persist_as_script: false },
}

function aiTextPlugin(input: {
  role: ProductionRole
  label: string
  description: string
  purpose: string
  stage: ProductionPlugin['stage']
  promptKey: TextAction
  inputKind: 'story' | 'script' | 'text'
  outputKind: ContextKind
  outputAssets?: AssetReferenceKind
  collection?: ProductionPlugin['resultCollection']
  extraParameters?: readonly PluginParameterDefinition[]
}): ProductionPlugin {
  return {
    ...input,
    material: 'text',
    inputs: [{ kind: input.inputKind, source: 'upstream', required: false }],
    outputs: [{ kind: input.outputKind }, { kind: 'text' }],
    parameters: [
      ...textParameters,
      ...(input.extraParameters || []),
    ],
    defaultParameters: { method: 'ai-text', text: '' },
    defaultMethod: 'ai-text',
    methods: ['ai-text'],
    buildCommand: ({ project, data, context }) => ({
      kind: 'ai-text', project_id: project.id,
      source_text: requiredText(joinText(context.texts, data.parameters.text), `请在面板填写内容或连接${input.inputKind === 'story' ? '故事' : '文本'}节点`),
      action: input.promptKey, system_prompt: data.parameters.systemPrompt,
      storyboard_count: data.parameters.storyboardCount,
      provider: data.parameters.provider, model: data.parameters.model,
    }),
  }
}

function assetImagePlugin(role: ProductionRole, label: string, description: string, targetAsset: AssetKind): ProductionPlugin {
  const refKind = `${targetAsset}s` as AssetReferenceKind
  return {
    role, label, description, material: 'image', purpose: `生成可跨镜头复用的${label}`, stage: 'assets', targetAsset,
    inputs: [{ kind: 'text', source: 'upstream', required: false }, { kind: 'image', source: 'upstream', required: false, multiple: true }], outputs: [{ kind: refKind }, { kind: 'image' }], parameters: imageParameters,
    defaultParameters: { method: 'text-to-image', prompt: '', aspectRatio: '9:16', assetIndex: 0 },
    defaultMethod: 'text-to-image', methods: ['text-to-image', 'image-to-image'],
    buildCommand: ({ project, data, context }) => imageCommand(project, data, context),
  }
}

function genericMediaPlugin(role: 'generic-image' | 'generic-video', material: 'image' | 'video'): ProductionPlugin {
  const image = material === 'image'
  return {
    role, label: image ? '通用图片' : '通用视频', description: image ? '自由使用文生图或图生图' : '自由使用文生视频或图生视频',
    material, purpose: image ? '生成通用图片材料' : '生成通用视频材料', stage: 'utility',
    inputs: [{ kind: 'text', source: 'upstream', required: false }, { kind: 'image', source: 'upstream', required: false, multiple: true }],
    outputs: [{ kind: image ? 'image' : 'shot-videos' }], parameters: image ? imageParameters : videoParameters,
    defaultParameters: image
      ? { method: 'text-to-image', prompt: '', aspectRatio: '9:16' }
      : { method: 'text-to-video', prompt: '', aspectRatio: '9:16', duration: 5 },
    defaultMethod: image ? 'text-to-image' : 'text-to-video',
    methods: image ? ['text-to-image', 'image-to-image'] : ['text-to-video', 'image-to-video'],
    buildCommand: ({ project, data, context }) => image
      ? imageCommand(project, data, context)
      : videoCommand(project, data, context),
  }
}

export const productionPlugins: readonly ProductionPlugin[] = [
  storyPlugin,
  aiTextPlugin({ role: 'script', label: '剧本', description: '把故事写成场次、动作和对白', purpose: '把故事扩写为剧本', stage: 'script', promptKey: 'write-script', inputKind: 'story', outputKind: 'script' }),
  aiTextPlugin({ role: 'character-extraction', label: '提取角色', description: '从剧本整理需要保持一致的角色', purpose: '同步角色资产', stage: 'assets', promptKey: 'extract-characters', inputKind: 'script', outputKind: 'characters', outputAssets: 'characters', collection: { key: 'characters', fields: ['name', 'description', 'appearance'] } }),
  aiTextPlugin({ role: 'scene-extraction', label: '提取场景', description: '从剧本整理反复出现的拍摄场景', purpose: '同步场景资产', stage: 'assets', promptKey: 'extract-scenes', inputKind: 'script', outputKind: 'scenes', outputAssets: 'scenes', collection: { key: 'scenes', fields: ['location', 'prompt'] } }),
  aiTextPlugin({ role: 'prop-extraction', label: '提取道具', description: '从剧本整理关键道具和外观要求', purpose: '同步道具资产', stage: 'assets', promptKey: 'extract-props', inputKind: 'script', outputKind: 'props', outputAssets: 'props', collection: { key: 'props', fields: ['name', 'description', 'prompt'] } }),
  assetImagePlugin('character-asset', '角色资产图', '跨镜头复用的角色标准图', 'character'),
  assetImagePlugin('scene-asset', '场景资产图', '跨镜头复用的场景标准图', 'scene'),
  assetImagePlugin('prop-asset', '道具资产图', '跨镜头复用的道具标准图', 'prop'),
  {
    ...aiTextPlugin({ role: 'storyboard-plan', label: '分镜清单', description: '把剧本拆成逐镜头清单并绑定实际入画资产', purpose: '建立分镜与资产关系', stage: 'storyboard', promptKey: 'split-storyboards', inputKind: 'script', outputKind: 'storyboards', outputAssets: 'storyboards', collection: { key: 'storyboards', fields: ['title', 'description', 'action', 'dialogue', 'image_prompt', 'video_prompt'] }, extraParameters: [{ key: 'storyboardCount', label: '分镜数量', control: 'integer' }] }),
    inputs: [
      { kind: 'script', source: 'upstream', required: false },
      { kind: 'characters', source: 'upstream', required: false, multiple: true },
      { kind: 'scenes', source: 'upstream', required: false, multiple: true },
      { kind: 'props', source: 'upstream', required: false, multiple: true },
    ],
  },
  {
    role: 'storyboard-image', label: '分镜图', description: '组合直接连入的文本与资产图，也可只用面板独立生成', material: 'image', purpose: '生成单镜头画面', stage: 'storyboard', targetAsset: 'storyboard',
    inputs: [{ kind: 'text', source: 'upstream', required: false, multiple: true }, { kind: 'image', source: 'upstream', required: false, multiple: true }], outputs: [{ kind: 'storyboard-image' }, { kind: 'image' }], parameters: imageParameters,
    defaultParameters: { method: 'image-to-image', prompt: '', aspectRatio: '9:16', assetIndex: 0 }, defaultMethod: 'image-to-image', methods: ['image-to-image'],
    buildCommand: ({ project, data, context }) => imageCommand(project, data, context),
  },
  {
    role: 'shot-video', label: '镜头视频', description: '组合直接连入的分镜图与面板视频提示词', material: 'video', purpose: '生成单镜头视频', stage: 'shot', targetAsset: 'storyboard',
    inputs: [{ kind: 'text', source: 'upstream', required: false, multiple: true }, { kind: 'storyboard-image', source: 'upstream', required: false }], outputs: [{ kind: 'shot-videos' }], parameters: videoParameters,
    defaultParameters: { method: 'image-to-video', prompt: '', aspectRatio: '9:16', duration: 4, assetIndex: 0 }, defaultMethod: 'image-to-video', methods: ['text-to-video', 'image-to-video'],
    buildCommand: ({ project, data, context }) => videoCommand(project, data, context),
  },
  {
    role: 'episode-compose', label: '整集合成', description: '按直接连入的顺序合成本集镜头视频', material: 'video', purpose: '输出完整短剧成片', stage: 'compose',
    inputs: [{ kind: 'shot-videos', source: 'upstream', required: false, multiple: true }], outputs: [{ kind: 'shot-videos' }],
    parameters: [{ key: 'episodeId', label: '输出剧集', control: 'episode' }], defaultParameters: { method: 'compose' }, defaultMethod: 'compose', methods: ['compose'],
    buildCommand: ({ project, data, context }) => ({ kind: 'finalize', project_id: project.id, episode_id: requiredId(data.parameters.episodeId ?? episodeId(data, project), '请选择输出剧集'), video_urls: context.videos }),
  },
  genericMediaPlugin('generic-image', 'image'),
  genericMediaPlugin('generic-video', 'video'),
] as const

const pluginsByRole = new Map<ProductionRole, ProductionPlugin>()
for (const plugin of productionPlugins) {
  if (pluginsByRole.has(plugin.role)) throw new Error(`生产插件角色重复：${plugin.role}`)
  pluginsByRole.set(plugin.role, plugin)
}

export function productionPlugin(role: ProductionRole): ProductionPlugin {
  const plugin = pluginsByRole.get(role)
  if (!plugin) throw new Error(`未知生产节点插件：${role}`)
  return plugin
}

export function createProductionNodeData(role: ProductionRole, overrides: Partial<ProductionNodeData> = {}): ProductionNodeData {
  const plugin = productionPlugin(role)
  return {
    role,
    title: overrides.title ?? plugin.label,
    parameters: cloneParameters(plugin.defaultParameters, overrides.parameters),
    assetRefs: cloneRefs(overrides.assetRefs || {}),
    result: { ...(overrides.result || {}) },
    history: overrides.history ? overrides.history.map((item) => ({ ...item, assetRefs: cloneRefs(item.assetRefs || {}) })) : [],
    status: overrides.status ?? 'idle',
    manuallyCompleted: overrides.manuallyCompleted ?? false,
    execution: overrides.execution ? { ...overrides.execution } : undefined,
    error: overrides.error,
  }
}

function cloneParameters(
  defaults: ProductionNodeParameters,
  overrides: ProductionNodeParameters | undefined,
): ProductionNodeParameters {
  const parameters = { ...defaults, ...(overrides || {}) }
  return {
    ...parameters,
    referenceImages: parameters.referenceImages ? [...parameters.referenceImages] : undefined,
  }
}

export function materialOf(data: Pick<ProductionNodeData, 'role'>): ProductionMaterial {
  return productionPlugin(data.role).material
}

export function assetKindOf(data: Pick<ProductionNodeData, 'role'>): AssetKind | undefined {
  const target = productionPlugin(data.role).targetAsset
  return target === 'storyboard' ? undefined : target
}

export function roleLabel(data: Pick<ProductionNodeData, 'role'>): string {
  return productionPlugin(data.role).label
}

export function materialLabel(material: ProductionMaterial): string {
  return { text: '文本材料', image: '图片材料', video: '视频材料' }[material]
}

export function assetKindLabel(kind: AssetKind | undefined): string {
  return kind ? { character: '角色', scene: '场景', prop: '道具' }[kind] : ''
}

export function productionStatusLabel(status: ProductionNodeStatus | undefined): string {
  return { idle: '未运行', pending: '排队中', running: '生成中', completed: '已完成', failed: '失败', cancelled: '已停止' }[status ?? 'idle']
}

export function refsFor(kind: AssetReferenceKind, refs: AssetReferences): number[] {
  return refs[kind] || []
}

function imageCommand(
  project: Project,
  data: ProductionNodeData,
  context: ResolvedProductionContext,
): Extract<ProductionCommand, { kind: 'image' }> {
  const method = data.parameters.method === 'image-to-image' ? 'image-to-image' : 'text-to-image'
  return {
    kind: 'image', project_id: project.id, mode: method, prompt: joinText(context.texts, data.parameters.prompt),
    aspect_ratio: data.parameters.aspectRatio,
    reference_images: method === 'image-to-image' ? unique([...(data.parameters.referenceImages || []), ...context.images]) : [],
    provider: data.parameters.provider, model: data.parameters.model,
  }
}

function videoCommand(
  project: Project,
  data: ProductionNodeData,
  context: ResolvedProductionContext,
): Extract<ProductionCommand, { kind: 'video' }> {
  const method = data.parameters.method === 'image-to-video' ? 'image-to-video' : 'text-to-video'
  return {
    kind: 'video', project_id: project.id,
    mode: method,
    prompt: joinText(context.texts, data.parameters.prompt), aspect_ratio: data.parameters.aspectRatio,
    duration: data.parameters.duration,
    reference_images: method === 'image-to-video' ? unique([...(data.parameters.referenceImages || []), ...context.images]) : [],
    provider: data.parameters.provider, model: data.parameters.model,
  }
}

function episodeId(data: ProductionNodeData, project: Project): number | undefined {
  return data.assetRefs.episodes?.[0] ?? project.episodes?.[0]?.id
}

function requiredText(value: unknown, message: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(message)
  return text
}

function requiredId(value: number | undefined, message: string): number {
  if (!value) throw new Error(message)
  return value
}

function cloneRefs(refs: AssetReferences): AssetReferences {
  return Object.fromEntries(Object.entries(refs).map(([key, values]) => [key, values ? [...values] : values])) as AssetReferences
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function joinText(values: string[], local: string | undefined): string {
  return unique([...values, local || '']).join('\n\n')
}
