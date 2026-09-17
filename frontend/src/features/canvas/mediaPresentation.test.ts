import { describe, expect, it } from 'vitest'
import type { ProductionNodeData } from '../production/catalog'
import { createProductionNodeData } from '../production/catalog'
import { isVideoMedia } from './mediaPresentation'

function mediaData(data: Partial<ProductionNodeData>): ProductionNodeData {
  const role = data.role || 'generic-image'
  const created = createProductionNodeData(role, { title: '媒体', status: 'completed' })
  return {
    ...created,
    ...data,
    parameters: { ...created.parameters, ...(data.parameters || {}) },
    result: { ...created.result, ...(data.result || {}) },
  }
}

describe('媒体结果展示类型', () => {
  it('根据节点能力和结果地址识别视频', () => {
    expect(isVideoMedia(mediaData({ role: 'generic-video' }))).toBe(true)
    expect(isVideoMedia(mediaData({ parameters: { method: 'image-to-video' } }))).toBe(true)
    expect(isVideoMedia(mediaData({ result: { outputUrl: 'https://cdn.test/result.mp4?token=1' } }))).toBe(true)
  })

  it('图片生成结果保持图片预览', () => {
    expect(isVideoMedia(mediaData({
      role: 'generic-image',
      parameters: { method: 'image-to-image' },
      result: { outputUrl: 'https://cdn.test/result.png' },
    }))).toBe(false)
  })
})
