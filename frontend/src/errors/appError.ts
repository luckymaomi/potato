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
  guidance: 'config' | 'retry' | 'input' | 'generic'
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
  const detail = error.message.trim()
  const fromMessage = matchMessagePresentation(detail)
  const status = error.status
  const known = status ? STATUS_PRESENTATIONS[status] : undefined
  const codePresentation = CODE_PRESENTATIONS[error.code]
  const title = fromMessage?.title
    ?? codePresentation?.title
    ?? known?.title
    ?? (error.code === 'NETWORK_ERROR' ? '网络连接失败' : '操作失败')
  const action = fromMessage?.action
    ?? codePresentation?.action
    ?? known?.action
    ?? (error.retryable ? '请稍后重新运行。' : '请检查输入和配置后重新运行。')
  const guidance = fromMessage?.guidance
    ?? codePresentation?.guidance
    ?? known?.guidance
    ?? (error.retryable ? 'retry' : 'generic')
  const providerPrefix = error.provider ? `供应商 ${error.provider}：` : ''
  const displayMessage = `${title}：${providerPrefix}${detail || '没有返回具体原因'}。${action}`
  return {
    code: error.code,
    message: detail,
    status,
    retryable: error.retryable,
    provider: error.provider,
    title,
    action,
    displayMessage,
    guidance,
  }
}

export function userErrorMessage(value: unknown): string {
  return presentError(value).displayMessage
}

/** 配置类问题用弹窗写清原因与下一步；其余用顶部提示。 */
export function notifyAppError(
  apis: {
    message: { error: (content: string) => void }
    modal: { warning: (config: { title: string; content: string; okText?: string }) => void }
  },
  value: unknown,
): void {
  const presentation = presentError(value)
  if (presentation.guidance === 'config') {
    apis.modal.warning({
      title: presentation.title,
      content: `${presentation.message || '没有返回具体原因'}\n\n下一步：${presentation.action}`,
      okText: '知道了',
    })
    return
  }
  apis.message.error(presentation.displayMessage)
}

export function notifyAppSuccess(
  messageApi: { success: (content: string) => void },
  content: string,
): void {
  messageApi.success(content)
}

type PresentationRule = { title: string; action: string; guidance: ErrorPresentation['guidance'] }

const STATUS_PRESENTATIONS: Record<number, PresentationRule> = {
  400: { title: '请求内容有误', action: '请检查输入、模型和生成参数后重试。', guidance: 'input' },
  401: { title: '身份验证失败', action: '请打开「AI 配置」，检查根 config.yaml 中的供应商密钥后重试。', guidance: 'config' },
  403: { title: '当前账号无权调用', action: '请检查供应商权限、模型权限或账户状态。', guidance: 'config' },
  404: { title: '请求的资源不存在', action: '请刷新模型目录，并检查项目、记录或接口地址。', guidance: 'input' },
  408: { title: '请求等待超时', action: '本次运行已终止，请稍后重新运行。', guidance: 'retry' },
  409: { title: '数据版本冲突', action: '请重新加载最新数据后再操作。', guidance: 'retry' },
  413: { title: '上传内容过大', action: '请压缩文件或减少提交内容后重试。', guidance: 'input' },
  422: { title: '供应商无法处理请求', action: '请检查提示词、参考图和模型能力后重试。', guidance: 'input' },
  429: { title: '供应商请求过于频繁', action: '短暂自动重试已经用尽，本次运行已终止，请稍后手动重新运行。', guidance: 'retry' },
  500: { title: '服务内部出错', action: '本次运行已终止；若持续发生，请查看后端日志。', guidance: 'retry' },
  502: { title: 'AI 供应商响应异常', action: '本次运行已终止，请稍后重新运行或到「AI 配置」切换供应商。', guidance: 'retry' },
  503: { title: '服务暂时不可用', action: '本次运行已终止，请等待服务恢复后重新运行。', guidance: 'retry' },
  504: { title: 'AI 供应商响应超时', action: '本次运行已终止，请稍后重新运行。', guidance: 'retry' },
}

const CODE_PRESENTATIONS: Record<string, PresentationRule> = {
  CANVAS_REVISION_CONFLICT: STATUS_PRESENTATIONS[409],
  FILE_TOO_LARGE: STATUS_PRESENTATIONS[413],
  NETWORK_ERROR: { title: '网络连接失败', action: '请确认前后端和网络可用后重新运行。', guidance: 'retry' },
  timeout: STATUS_PRESENTATIONS[504],
  configuration: { title: 'AI 配置不完整', action: '请打开「AI 配置」，填写供应商密钥并刷新模型目录。', guidance: 'config' },
  unsupported_capability: { title: '当前模型不支持此能力', action: '请到「AI 配置」选择支持当前生成方式、参考图数量和画幅的模型。', guidance: 'config' },
  invalid_response: { title: 'AI 返回内容无法识别', action: '请稍后重试；若持续发生，请到「AI 配置」切换模型或供应商。', guidance: 'retry' },
  VALIDATION_ERROR: { title: '当前无法执行', action: '请按提示检查配置或输入后重试。', guidance: 'input' },
  API_REQUEST_ERROR: { title: '请求失败', action: '请检查网络与 AI 配置后重试。', guidance: 'generic' },
}

const MESSAGE_PRESENTATIONS: Array<{ pattern: RegExp; rule: PresentationRule }> = [
  {
    pattern: /尚未配置\s*API\s*Key|未配置\s*API\s*密钥/i,
    rule: { title: '供应商密钥未配置', action: '请打开顶部「AI 配置」，在 config.yaml 中填写对应供应商密钥，再回来重试。', guidance: 'config' },
  },
  {
    pattern: /尚未同步可用的|请先打开\s*AI\s*配置刷新模型目录|实时目录中没有|不在实时目录|没有可用的/,
    rule: { title: '模型目录未就绪', action: '请打开顶部「AI 配置」，点击刷新同步模型列表，并确认已选择默认图片/视频模型。', guidance: 'config' },
  },
  {
    pattern: /已在\s*config\.yaml\s*中停用|供应商当前不可用|供应商未注册/,
    rule: { title: '供应商不可用', action: '请打开「AI 配置」检查供应商是否启用、密钥是否有效。', guidance: 'config' },
  },
  {
    pattern: /不支持画幅|不支持.*参考图|不支持文生|不支持图生/,
    rule: { title: '模型能力不匹配', action: '请到「AI 配置」更换支持当前能力的模型，或调整画幅/参考图数量。', guidance: 'config' },
  },
  {
    pattern: /已有进行中的生成任务/,
    rule: { title: '已有任务进行中', action: '请等待当前任务完成，或先点「停止」后再重新生成。', guidance: 'input' },
  },
]

function matchMessagePresentation(message: string): PresentationRule | undefined {
  for (const item of MESSAGE_PRESENTATIONS) {
    if (item.pattern.test(message)) return item.rule
  }
  return undefined
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
