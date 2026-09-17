import { describe, expect, it } from 'vitest'
import type { ProductionNodeData } from '../production/catalog'
import { isVideoMedia } from './mediaPresentation'

function mediaData(data: Partial<ProductionNodeData>): ProductionNodeData {
  return {
    title: '媒体',
    role: 'generic-image',
    status: 'completed',
    ...data,
  }
}

describe('媒体结果展示类型', () => {
  it('根据节点能力和结果地址识别视频', () => {
    expect(isVideoMedia(mediaData({ role: 'generic-video' }))).toBe(true)
    expect(isVideoMedia(mediaData({ generationMode: 'image-to-video' }))).toBe(true)
    expect(isVideoMedia(mediaData({ outputUrl: 'https://cdn.test/result.mp4?token=1' }))).toBe(true)
  })

  it('图片生成结果保持图片预览', () => {
    expect(isVideoMedia(mediaData({
      role: 'generic-image',
      generationMode: 'image-to-image',
      outputUrl: 'https://cdn.test/result.png',
    }))).toBe(false)
  })
})
