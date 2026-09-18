import { describe, expect, it } from 'vitest'
import type { ProviderCatalogStatus, ProviderModel } from '../../types/domain'
import { emptyModelPresets, modelPresetFromKey, modelPresetKey, modelPresetOptions } from './modelPresets'

const providers: ProviderCatalogStatus[] = [
  { id: 'agnes', label: 'Agnes', aliases: [], capabilities: { text: true, textToImage: true, imageToImage: true, textToVideo: true, imageToVideo: true, asynchronous: true, multipleImageReferences: true, firstLastFrame: true }, enabled: true, configured: true, model_counts: { text: 1, image: 1, video: 1 }, synchronized_at: null },
  { id: 'disabled', label: 'Disabled', aliases: [], capabilities: { text: true, textToImage: true, imageToImage: false, textToVideo: false, imageToVideo: false, asynchronous: false, multipleImageReferences: false, firstLastFrame: false }, enabled: false, configured: true, model_counts: { text: 1, image: 0, video: 0 }, synchronized_at: null },
]
const models: ProviderModel[] = [
  { provider: 'agnes', id: 'agnes-text', label: 'Agnes Text', kind: 'text', capabilities: { modes: [], maxReferenceImages: null, aspectRatios: [], source: 'adapter' }, synchronized_at: '2026-09-18T00:00:00.000Z' },
  { provider: 'disabled', id: 'disabled-text', label: 'Disabled Text', kind: 'text', capabilities: { modes: [], maxReferenceImages: null, aspectRatios: [], source: 'adapter' }, synchronized_at: '2026-09-18T00:00:00.000Z' },
]

describe('全局模型预设', () => {
  it('三个类型默认都可以留空，并能稳定编码供应商与模型', () => {
    expect(emptyModelPresets()).toEqual({ text: null, image: null, video: null })
    const preset = { provider: 'agnes', model: 'agnes/text:latest' }
    expect(modelPresetFromKey(modelPresetKey(preset))).toEqual(preset)
    expect(modelPresetFromKey(undefined)).toBeNull()
  })

  it('只列出已启用且已配置供应商的同类型模型，并保留失效当前值供用户清除', () => {
    expect(modelPresetOptions('text', models, providers, null).map((option) => option.label)).toEqual(['Agnes · agnes-text'])
    expect(modelPresetOptions('video', models, providers, { provider: 'old', model: 'gone' })[0]).toMatchObject({ disabled: true, label: expect.stringContaining('当前预设不可用') })
  })
})
