import { materialOf, type ProductionNodeData } from '../production/catalog'

export function isVideoMedia(data: Pick<ProductionNodeData, 'role' | 'generationMode' | 'outputUrl'>): boolean {
  return materialOf(data) === 'video'
    || data.generationMode === 'text-to-video'
    || data.generationMode === 'image-to-video'
    || /\.(mp4|webm|mov)(?:[?#].*)?$/iu.test(String(data.outputUrl || ''))
}
