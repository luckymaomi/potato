import { describe, expect, it } from 'vitest'
import type { MediaGenerationHistory } from '../../api/media'
import type { ProviderModel } from '../../types/domain'
import { historyVersionLabels, modelOptionLabel } from './inspectorPresentation'

describe('节点检查器精简呈现', () => {
  it('模型选项只显示模型标识，不拼接能力长句', () => {
    const model: ProviderModel = {
      provider: 'pearapi',
      id: 'gpt-image-2',
      label: 'gpt-image-2',
      kind: 'image',
      capabilities: { modes: ['text-to-image', 'image-to-image'], maxReferenceImages: 16, aspectRatios: ['9:16'], source: 'provider' },
      synchronized_at: '2026-09-17T00:00:00.000Z',
    }
    expect(modelOptionLabel(model)).toBe('gpt-image-2')
  })

  it('生成历史按时间显示短版本号', () => {
    const rows = [
      { id: 9, created_at: '2026-09-17T13:12:16.000Z' },
      { id: 4, created_at: '2026-09-17T13:10:05.000Z' },
    ] as MediaGenerationHistory[]
    expect(historyVersionLabels(rows, 'image')).toEqual(new Map([
      [4, '21:10:05 - 图片01'],
      [9, '21:12:16 - 图片02'],
    ]))
  })
})
