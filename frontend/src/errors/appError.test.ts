import { describe, expect, it, vi } from 'vitest'
import { AppError, notifyAppError, presentError } from './appError'

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

  it('把 API Key 与模型目录问题收成配置指引', () => {
    const key = presentError(new Error('Agnes 尚未配置 API Key'))
    expect(key.title).toBe('API Key 未配置')
    expect(key.guidance).toBe('config')
    expect(key.action).toContain('AI 配置')

    const catalog = presentError(new Error('尚未同步可用的图片模型，请先打开 AI 配置刷新模型目录'))
    expect(catalog.title).toBe('模型目录未就绪')
    expect(catalog.guidance).toBe('config')
    expect(catalog.action).toContain('刷新')
  })

  it('配置类错误用弹窗，其它用顶部提示', () => {
    const message = { error: vi.fn() }
    const modal = { warning: vi.fn() }
    notifyAppError({ message, modal }, new Error('PearAPI 尚未配置 API Key'))
    expect(modal.warning).toHaveBeenCalledOnce()
    expect(message.error).not.toHaveBeenCalled()

    notifyAppError({ message, modal }, new Error('Network Error'))
    expect(message.error).toHaveBeenCalledOnce()
  })
})
