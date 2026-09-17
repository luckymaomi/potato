import { describe, expect, it } from 'vitest'
import type { ProviderModel } from '../../types/domain'
import {
  aspectRatioLabel,
  aspectRatiosFor,
  modelCapabilityLabels,
  modelSupportsAspectRatio,
  modelSupportsMode,
  nodeServiceType,
  preferredAspectRatio,
  providerSupportsMode,
  supportsService,
} from './catalog'

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
    expect(nodeServiceType('text', 'manual', undefined)).toBeUndefined()
    expect(nodeServiceType('text', 'ai', undefined)).toBe('text')
    expect(nodeServiceType('image', undefined, 'image-to-image')).toBe('image')
    expect(nodeServiceType('video', undefined, 'image-to-video')).toBe('video')
    expect(nodeServiceType(undefined, undefined, undefined)).toBeUndefined()
  })

  it('按模型级能力过滤运行方式并展示参考图上限', () => {
    const model: ProviderModel = {
      provider: 'pearapi',
      id: 'image-live',
      label: 'Image Live',
      kind: 'image',
      capabilities: {
        modes: ['image-to-image'],
        maxReferenceImages: 3,
        aspectRatios: ['1:1', '9:16'],
        source: 'provider',
      },
      synchronized_at: '2026-09-17T00:00:00.000Z',
    }
    expect(modelSupportsMode(model, 'text-to-image')).toBe(false)
    expect(modelSupportsMode(model, 'image-to-image')).toBe(true)
    expect(modelCapabilityLabels(model)).toEqual(['图生图', '参考图最多 3 张', '画幅 1:1、9:16'])
    expect(modelSupportsAspectRatio(model, '9:16')).toBe(true)
    expect(modelSupportsAspectRatio(model, '16:9')).toBe(false)
    expect(aspectRatiosFor([model])).toEqual(['1:1', '9:16'])
    expect(preferredAspectRatio(model.capabilities.aspectRatios || [])).toBe('9:16')
    expect(aspectRatioLabel('9:16')).toBe('9:16 · 竖屏短视频')
    expect(providerSupportsMode(capabilities, 'image-to-image')).toBe(true)
    expect(providerSupportsMode(capabilities, 'text-to-video')).toBe(false)
  })

  it('不把未知参考图上限伪装成固定数字', () => {
    const model: ProviderModel = {
      provider: 'pearapi',
      id: 'unknown-limit',
      label: 'Unknown Limit',
      kind: 'image',
      capabilities: { modes: ['image-to-image'], maxReferenceImages: null, aspectRatios: null, source: 'provider' },
      synchronized_at: '2026-09-17T00:00:00.000Z',
    }
    expect(modelCapabilityLabels(model)).toEqual(['图生图', '参考图上限未知', '画幅比例未知'])
  })
})
