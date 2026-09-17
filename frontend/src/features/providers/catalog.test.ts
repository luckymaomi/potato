import { describe, expect, it } from 'vitest'
import { nodeServiceType, supportsService } from './catalog'

const capabilities = {
  text: false,
  textToImage: true,
  imageToImage: true,
  textToVideo: false,
  imageToVideo: false,
  asynchronous: true,
  multipleImageReferences: true,
  firstLastFrame: false,
}

describe('动态模型目录选择', () => {
  it('按供应商能力过滤服务类型', () => {
    expect(supportsService(capabilities, 'image')).toBe(true)
    expect(supportsService(capabilities, 'text')).toBe(false)
    expect(supportsService(capabilities, 'video')).toBe(false)
  })

  it('把节点运行方式映射到实时模型类型', () => {
    expect(nodeServiceType('text', 'manual')).toBeUndefined()
    expect(nodeServiceType('text', 'ai')).toBe('text')
    expect(nodeServiceType('storyboard', 'storyboard')).toBe('text')
    expect(nodeServiceType('image', 'image-to-image')).toBe('image')
    expect(nodeServiceType('video', 'image-to-video')).toBe('video')
  })
})
