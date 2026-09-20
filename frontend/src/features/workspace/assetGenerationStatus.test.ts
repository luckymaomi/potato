import { describe, expect, it } from 'vitest'
import { assetGenerationStatus } from './assetGenerationStatus'

describe('资产缩略图生成状态', () => {
  it('显示单次生成从排队到完成的可见阶段', () => {
    expect(assetGenerationStatus({ status: 'pending' })).toEqual({ label: '排队中', tone: 'pending' })
    expect(assetGenerationStatus({ status: 'processing', message: '正在提交图片生成' })).toEqual({ label: '正在生成', tone: 'processing' })
    expect(assetGenerationStatus({ status: 'processing', message: '归档中' })).toEqual({ label: '归档中', tone: 'archiving' })
    expect(assetGenerationStatus({ status: 'completed' })).toEqual({ label: '已完成', tone: 'completed' })
  })

  it('显示失败结果和已有标准图状态', () => {
    expect(assetGenerationStatus({ status: 'failed' })).toEqual({ label: '失败', tone: 'failed' })
    expect(assetGenerationStatus(undefined, true)).toEqual({ label: '已完成', tone: 'completed' })
  })
})
