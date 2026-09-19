import type { ProviderCapabilities, ProviderModel, ProviderModelMode, ServiceType } from '../../types/domain'
import type { MediaGenerationMode, ProductionMaterial, ProductionMethod, TextMode } from '../../types/production'

const modelModeLabels: Record<ProviderModelMode, string> = {
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
}

const commonAspectRatios = ['9:16', '16:9', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9']

export function supportsService(capabilities: ProviderCapabilities, serviceType: ServiceType): boolean {
  if (serviceType === 'text') return capabilities.text
  if (serviceType === 'image') return capabilities.textToImage || capabilities.imageToImage
  return capabilities.textToVideo || capabilities.imageToVideo
}

export function nodeServiceType(
  material: ProductionMaterial | undefined,
  methodOrTextMode: ProductionMethod | TextMode | undefined,
  generationMode: MediaGenerationMode | undefined,
): ServiceType | undefined {
  if (material === 'text') return methodOrTextMode === 'ai' || methodOrTextMode === 'ai-text' ? 'text' : undefined
  if (material === 'image') return 'image'
  if (material === 'video') return 'video'
  const mode = generationMode || methodOrTextMode
  if (mode === 'text-to-video' || mode === 'image-to-video') return 'video'
  if (mode === 'text-to-image' || mode === 'image-to-image') return 'image'
  return undefined
}

export function providerSupportsMode(capabilities: ProviderCapabilities, mode: MediaGenerationMode | undefined): boolean {
  if (mode === 'text-to-image') return capabilities.textToImage
  if (mode === 'image-to-image') return capabilities.imageToImage
  if (mode === 'text-to-video') return capabilities.textToVideo
  if (mode === 'image-to-video') return capabilities.imageToVideo
  return true
}

export function modelSupportsMode(model: ProviderModel, mode: MediaGenerationMode | undefined): boolean {
  if (!isProviderModelMode(mode)) return true
  return model.capabilities.modes.length === 0 || model.capabilities.modes.includes(mode)
}

export function modelCapabilityLabels(model: ProviderModel): string[] {
  if (model.kind === 'text') return ['文本生成']
  const labels = model.capabilities.modes.map((mode) => modelModeLabels[mode])
  if (!labels.length) labels.push('能力待确认')
  if (model.capabilities.maxReferenceImages === null) labels.push('参考图上限未知')
  else if (model.capabilities.maxReferenceImages > 0) labels.push(`参考图最多 ${model.capabilities.maxReferenceImages} 张`)
  else labels.push('不支持参考图')
  if (model.capabilities.aspectRatios === null) labels.push('画幅比例未知')
  else if (model.capabilities.aspectRatios.length) labels.push(`画幅 ${model.capabilities.aspectRatios.join('、')}`)
  if (model.kind === 'video') {
    if (model.capabilities.billingMode === 'duration') labels.push('按时长')
    else if (model.capabilities.billingMode === 'per-request') labels.push('按次')
    else labels.push('时长能力未知')
    if (model.capabilities.supportedDurations?.length) labels.push(`时长 ${model.capabilities.supportedDurations.join('、')} 秒`)
  }
  return labels
}

export function modelSupportsDuration(model: ProviderModel | undefined): boolean {
  return model?.kind === 'video' && model.capabilities.supportsDuration === true
}

export function modelDurationOptions(model: ProviderModel | undefined): number[] {
  return model?.capabilities.supportedDurations?.length
    ? model.capabilities.supportedDurations
    : modelSupportsDuration(model) ? [4, 6, 8, 10, 12, 15] : []
}

export function modelCapabilitySummary(model: ProviderModel): string {
  return modelCapabilityLabels(model).join(' · ')
}

export function requiresReferenceImage(mode: MediaGenerationMode | undefined): boolean {
  return mode === 'image-to-image' || mode === 'image-to-video'
}

export function modelSupportsAspectRatio(model: ProviderModel, aspectRatio: string | undefined): boolean {
  if (!aspectRatio) return true
  return model.capabilities.aspectRatios === null || model.capabilities.aspectRatios.includes(aspectRatio)
}

export function aspectRatiosFor(models: ProviderModel[], current?: string): string[] {
  const hasUnknownCapabilities = models.some((model) => model.capabilities.aspectRatios === null)
  const declared = models.flatMap((model) => model.capabilities.aspectRatios || [])
  return [...new Set([
    ...(hasUnknownCapabilities && current ? [current] : []),
    ...declared,
    ...(hasUnknownCapabilities ? commonAspectRatios : []),
  ])]
}

export function preferredAspectRatio(aspectRatios: string[], current?: string): string | undefined {
  if (current && aspectRatios.includes(current)) return current
  return ['9:16', '16:9', '1:1'].find((ratio) => aspectRatios.includes(ratio)) || aspectRatios[0]
}

export function aspectRatioLabel(aspectRatio: string): string {
  const names: Record<string, string> = {
    '9:16': '竖屏短视频',
    '16:9': '横屏宽画幅',
    '1:1': '方形',
    '4:3': '横向经典',
    '3:4': '竖向经典',
    '3:2': '横向摄影',
    '2:3': '竖向摄影',
    '21:9': '超宽银幕',
  }
  return names[aspectRatio] ? `${aspectRatio} · ${names[aspectRatio]}` : aspectRatio
}

function isProviderModelMode(mode: MediaGenerationMode | undefined): mode is ProviderModelMode {
  return mode === 'text-to-image'
    || mode === 'image-to-image'
    || mode === 'text-to-video'
    || mode === 'image-to-video'
}
