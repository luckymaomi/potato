export interface StructuredFailure {
  code: string
  message: string
  status?: number
  retryable: boolean
  provider?: string
}

export interface ErrorPresentation extends StructuredFailure {
  title: string
  action: string
  displayMessage: string
}

export class AppError extends Error implements StructuredFailure {
  readonly code: string
  readonly status?: number
  readonly retryable: boolean
  readonly provider?: string

  constructor(failure: StructuredFailure, options?: ErrorOptions) {
    super(failure.message, options)
    this.name = 'AppError'
    this.code = failure.code
    this.status = failure.status
    this.retryable = failure.retryable
    this.provider = failure.provider
  }
}

export function normalizeError(value: unknown): AppError {
  if (value instanceof AppError) return value
  const message = value instanceof Error ? value.message : String(value || '发生未知错误')
  const status = inferStatus(message)
  return new AppError({
    code: status ? `HTTP_${status}` : looksLikeNetworkError(message) ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
    message,
    status,
    retryable: status ? [408, 425, 429, 500, 502, 503, 504].includes(status) : looksLikeNetworkError(message),
  }, value instanceof Error ? { cause: value } : undefined)
}

export function presentError(value: unknown): ErrorPresentation {
  const error = normalizeError(value)
  const status = error.status
  const known = status ? STATUS_PRESENTATIONS[status] : undefined
  const codePresentation = CODE_PRESENTATIONS[error.code]
  const title = codePresentation?.title ?? known?.title ?? (error.code === 'NETWORK_ERROR' ? '网络连接失败' : '操作失败')
  const action = codePresentation?.action ?? known?.action ?? (error.retryable ? '请稍后重新运行。' : '请检查输入和配置后重新运行。')
  const detail = error.message.trim()
  const displayMessage = `${title}：${detail || '没有返回具体原因'}。${action}`
  return {
    code: error.code,
    message: detail,
    status,
    retryable: error.retryable,
    provider: error.provider,
    title,
    action,
    displayMessage,
  }
}

export function userErrorMessage(value: unknown): string {
  return presentError(value).displayMessage
}

const STATUS_PRESENTATIONS: Record<number, { title: string; action: string }> = {
  400: { title: '请求内容有误', action: '请检查节点输入、模型和生成参数后重试。' },
  401: { title: '身份验证失败', action: '请检查根配置中的 API Key 后重试。' },
  403: { title: '当前账号无权调用', action: '请检查供应商权限、模型权限或账户状态。' },
  404: { title: '请求的资源不存在', action: '请刷新模型目录，并检查项目、记录或接口地址。' },
  408: { title: '请求等待超时', action: '本次运行已终止，请稍后重新运行。' },
  409: { title: '数据版本冲突', action: '请重新加载最新数据后再操作。' },
  413: { title: '上传内容过大', action: '请压缩文件或减少提交内容后重试。' },
  422: { title: '供应商无法处理请求', action: '请检查提示词、参考图和模型能力后重试。' },
  429: { title: '供应商请求过于频繁', action: '短暂自动重试已经用尽，本次运行已终止，请稍后手动重新运行。' },
  500: { title: '服务内部出错', action: '本次运行已终止；若持续发生，请查看后端日志。' },
  502: { title: 'AI 供应商响应异常', action: '本次运行已终止，请稍后重新运行或切换供应商。' },
  503: { title: '服务暂时不可用', action: '本次运行已终止，请等待服务恢复后重新运行。' },
  504: { title: 'AI 供应商响应超时', action: '本次运行已终止，请稍后重新运行。' },
}

const CODE_PRESENTATIONS: Record<string, { title: string; action: string }> = {
  CANVAS_REVISION_CONFLICT: STATUS_PRESENTATIONS[409],
  FILE_TOO_LARGE: STATUS_PRESENTATIONS[413],
  NETWORK_ERROR: { title: '网络连接失败', action: '请确认前后端和网络可用后重新运行。' },
  timeout: STATUS_PRESENTATIONS[504],
  configuration: { title: 'AI 配置不完整', action: '请检查根 config.yaml 和模型目录后重试。' },
  unsupported_capability: { title: '当前模型不支持此能力', action: '请选择支持当前生成方式、参考图数量和画幅的模型。' },
  invalid_response: { title: 'AI 返回内容无法识别', action: '请稍后重试；若持续发生，请切换模型或供应商。' },
}

function inferStatus(message: string): number | undefined {
  const match = message.match(/\b(?:HTTP|status(?:\s+code)?)[\s:：-]*(\d{3})\b/i)
    ?? message.match(/(?:状态码|状态)[\s:：-]*(\d{3})/)
  if (match) {
    const status = Number(match[1])
    if (status >= 400 && status <= 599) return status
  }
  if (/too many requests|rate[\s_-]*limit|请求(?:过于|太)?频繁|频率限制|限流/i.test(message)) return 429
  if (/gateway timeout|请求超时|连接超时|\btimeout\b/i.test(message)) return 504
  return undefined
}

function looksLikeNetworkError(message: string): boolean {
  return /network|fetch failed|socket|econn(?:reset|refused)|enotfound|网络|连接失败/i.test(message)
}
