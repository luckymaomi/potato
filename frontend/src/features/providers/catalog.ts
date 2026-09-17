import type { CanvasNodeKind, MediaMode, TextMode } from '../../store/workbenchStore'
import type { ProviderCapabilities, ServiceType } from '../../types/domain'

export function supportsService(capabilities: ProviderCapabilities, serviceType: ServiceType): boolean {
  if (serviceType === 'text') return capabilities.text
  if (serviceType === 'image') return capabilities.textToImage || capabilities.imageToImage
  return capabilities.textToVideo || capabilities.imageToVideo
}

export function nodeServiceType(
  preset: CanvasNodeKind | undefined,
  mode: MediaMode | TextMode | undefined,
): ServiceType | undefined {
  if (preset === 'text') return mode === 'ai' ? 'text' : undefined
  if (preset === 'storyboard' && (!mode || mode === 'storyboard')) return 'text'
  if (mode === 'text-to-video' || mode === 'image-to-video' || preset === 'video') return 'video'
  return 'image'
}
