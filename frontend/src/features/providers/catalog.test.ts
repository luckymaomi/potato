import { describe, expect, it } from 'vitest'
import type { ProviderModel } from '../../types/domain'
import {
  aspectRatioLabel,
  aspectRatiosFor,
  modelAspectRatioOptions,
  modelCapabilityLabels,
  modelDurationOptions,
  modelSupportsDuration,
  modelSupportsAspectRatio,
  modelSupportsMode,
  nodeServiceType,
  preferredAspectRatio,
  providerSupportsMode,
  supportsService,
} from './catalog'

const capabilities = {
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
    expect(supportsService(capabilities, 'video')).toBe(false)
  })

  it('把生成方式映射到实时模型类型', () => {
    expect(nodeServiceType('text', 'manual', undefined)).toBeUndefined()
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
    expect(modelCapabilityLabels(model)).toEqual(['图生图', '参考图最多 3 张', '图片画幅 1:1、9:16'])
    expect(modelSupportsAspectRatio(model, '9:16')).toBe(true)
    expect(modelSupportsAspectRatio(model, '16:9')).toBe(false)
    expect(aspectRatiosFor([model])).toEqual(['1:1', '9:16'])
    expect(preferredAspectRatio(model.capabilities.aspectRatios || [])).toBe('1:1')
    expect(preferredAspectRatio(model.capabilities.aspectRatios || [], '9:16')).toBe('9:16')
    expect(aspectRatioLabel('9:16')).toBe('9:16 · 竖屏短视频')
    expect(providerSupportsMode(capabilities, 'image-to-image')).toBe(true)
    expect(providerSupportsMode(capabilities, 'text-to-video')).toBe(false)
  })

  it('不把未知参考图上限伪装成固定数字，也不伪造通用画幅', () => {
    const model: ProviderModel = {
      provider: 'pearapi',
      id: 'unknown-limit',
      label: 'Unknown Limit',
      kind: 'image',
      capabilities: { modes: ['image-to-image'], maxReferenceImages: null, aspectRatios: null, source: 'provider' },
      synchronized_at: '2026-09-17T00:00:00.000Z',
    }
    expect(modelCapabilityLabels(model)).toEqual(['图生图', '参考图上限未知', '图片画幅未知'])
    expect(modelSupportsAspectRatio(model, '9:16')).toBe(true)
    expect(aspectRatiosFor([model], '5:4')).toEqual(['5:4'])
    expect(aspectRatiosFor([model])).toEqual([])
  })

  it('不因目录没有声明模式而隐藏模型', () => {
    const model: ProviderModel = {
      provider: 'pearapi',
      id: 'gpt-image-2',
      label: 'GPT Image 2',
      kind: 'image',
      capabilities: { modes: [], maxReferenceImages: null, aspectRatios: null, source: 'provider' },
      synchronized_at: '2026-09-18T00:00:00.000Z',
    }
    expect(modelSupportsMode(model, 'text-to-image')).toBe(true)
    expect(modelSupportsMode(model, 'image-to-image')).toBe(true)
  })

  it('区分按次视频与按时长视频，不为未知能力伪造时长或画幅', () => {
    const perRequest: ProviderModel = {
      provider: 'pearapi', id: 'grok-imagine-video-1.5', label: 'Grok Imagine Video 1.5', kind: 'video',
      capabilities: { modes: ['text-to-video', 'image-to-video'], maxReferenceImages: 1, aspectRatios: ['16:9', '9:16'], billingMode: 'per-request', supportsDuration: true, supportedDurations: [4, 6, 8, 10, 12, 15], source: 'provider' },
      synchronized_at: '2026-09-18T00:00:00.000Z',
    }
    const duration: ProviderModel = {
      provider: 'agnes', id: 'agnes-video-2.5-flash', label: 'Agnes Video 2.5 Flash', kind: 'video',
      capabilities: { modes: ['text-to-video', 'image-to-video'], maxReferenceImages: 5, aspectRatios: ['16:9'], billingMode: 'duration', supportsDuration: true, supportedDurations: null, source: 'adapter' },
      synchronized_at: '2026-09-18T00:00:00.000Z',
    }
    const unknown: ProviderModel = { ...perRequest, id: 'unknown-video', capabilities: { ...perRequest.capabilities, billingMode: 'unknown', supportsDuration: false, supportedDurations: null } }
    expect(modelSupportsDuration(perRequest)).toBe(true)
    expect(modelSupportsDuration(duration)).toBe(true)
    expect(modelSupportsDuration(unknown)).toBe(false)
    expect(modelCapabilityLabels(perRequest)).toContain('按次')
    expect(modelCapabilityLabels(perRequest)).toContain('视频画幅 16:9、9:16')
    expect(modelCapabilityLabels(duration)).toContain('按时长')
    expect(modelCapabilityLabels(unknown)).toContain('时长能力未知')
    expect(modelDurationOptions(perRequest)).toEqual([4, 6, 8, 10, 12, 15])
    expect(modelDurationOptions(duration)).toEqual([])
    expect(modelDurationOptions(unknown)).toEqual([])
    expect(modelAspectRatioOptions(perRequest)).toEqual(['16:9', '9:16'])
    expect(modelAspectRatioOptions(duration)).toEqual(['16:9'])
    expect(preferredAspectRatio(modelAspectRatioOptions(perRequest))).toBe('16:9')
  })
})
