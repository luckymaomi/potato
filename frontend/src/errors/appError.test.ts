import { describe, expect, it } from 'vitest'
import { AppError, presentError } from './appError'

describe('统一错误展示', () => {
  it.each([
    [404, '请求的资源不存在'],
    [429, '供应商请求过于频繁'],
    [500, '服务内部出错'],
    [502, 'AI 供应商响应异常'],
    [503, '服务暂时不可用'],
    [504, 'AI 供应商响应超时'],
  ])('把 HTTP %i 转换成友好且可诊断的错误', (status, title) => {
    const presentation = presentError(new AppError({
      code: `HTTP_${status}`,
      message: `上游返回 HTTP ${status}`,
      status,
      retryable: status !== 404,
    }))
    expect(presentation.title).toBe(title)
    expect(presentation.displayMessage).toContain(`HTTP ${status}`)
    expect(presentation.action.length).toBeGreaterThan(0)
  })

  it('识别没有结构化状态的限流和网络错误', () => {
    expect(presentError(new Error('rate limit exceeded')).status).toBe(429)
    expect(presentError(new Error('Network Error')).code).toBe('NETWORK_ERROR')
  })
})
