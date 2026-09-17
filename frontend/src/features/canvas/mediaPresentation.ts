import { materialOf, type ProductionNodeData } from '../production/catalog'

export function isVideoMedia(data: Pick<ProductionNodeData, 'role' | 'parameters' | 'result'>): boolean {
  return materialOf(data) === 'video'
    || data.parameters.method === 'text-to-video'
    || data.parameters.method === 'image-to-video'
    || /\.(mp4|webm|mov)(?:[?#].*)?$/iu.test(String(data.result.outputUrl || ''))
}
