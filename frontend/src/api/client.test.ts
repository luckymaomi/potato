import { describe, expect, it } from 'vitest'
import { API_REQUEST_TIMEOUT_MS } from './client'

describe('前端 API 超时合同', () => {
  it('生成状态等待不设置本地时间上限', () => {
    expect(API_REQUEST_TIMEOUT_MS).toBe(0)
  })
})
