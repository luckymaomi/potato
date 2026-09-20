import { describe, expect, it } from 'vitest'
import type { ProviderCatalogStatus, ProviderModel } from '../../types/domain'
import { emptyModelPresets, modelPresetFromKey, modelPresetKey, modelPresetOptions } from './modelPresets'

const providers: ProviderCatalogStatus[] = [
  { id: 'agnes', label: 'Agnes', aliases: [], capabilities: { textToImage: true, imageToImage: true, textToVideo: true, imageToVideo: true, asynchronous: true, multipleImageReferences: true, firstLastFrame: true }, enabled: true, configured: true, model_counts: { image: 1, video: 1 }, synchronized_at: null },
  { id: 'disabled', label: 'Disabled', aliases: [], capabilities: { textToImage: true, imageToImage: false, textToVideo: false, imageToVideo: false, asynchronous: false, multipleImageReferences: false, firstLastFrame: false }, enabled: false, configured: true, model_counts: { image: 1, video: 0 }, synchronized_at: null },
]
const models: ProviderModel[] = [
  { provider: 'agnes', id: 'agnes-image', label: 'Agnes Image', kind: 'image', capabilities: { modes: ['text-to-image'], maxReferenceImages: 0, aspectRatios: ['9:16'], source: 'adapter' }, synchronized_at: '2026-09-18T00:00:00.000Z' },
  { provider: 'disabled', id: 'disabled-image', label: 'Disabled Image', kind: 'image', capabilities: { modes: ['text-to-image'], maxReferenceImages: 0, aspectRatios: ['9:16'], source: 'adapter' }, synchronized_at: '2026-09-18T00:00:00.000Z' },
]

describe('全局模型预设', () => {
  it('图片与视频预设默认可以留空，并能稳定编码供应商与模型', () => {
    expect(emptyModelPresets()).toEqual({ image: null, video: null })
    const preset = { provider: 'agnes', model: 'agnes/image:latest' }
    expect(modelPresetFromKey(modelPresetKey(preset))).toEqual(preset)
    expect(modelPresetFromKey(undefined)).toBeNull()
  })

  it('只列出已启用且已配置供应商的同类型模型，并保留失效当前值供用户清除', () => {
    expect(modelPresetOptions('image', models, providers, null).map((option) => option.label)).toEqual(['Agnes · agnes-image'])
    expect(modelPresetOptions('video', models, providers, { provider: 'old', model: 'gone' })[0]).toMatchObject({ disabled: true, label: expect.stringContaining('当前预设不可用') })
  })
})
