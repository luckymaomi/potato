import { ApplicationError } from './errors';
import { ProviderError } from './providers/errors';

export interface StructuredError {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
  provider?: string;
}

export interface ResolvedError {
  responseStatus: number;
  error: StructuredError;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function resolveError(value: unknown): ResolvedError {
  if (value instanceof ApplicationError) {
    return {
      responseStatus: value.status,
      error: {
        code: value.code,
        message: value.message,
        status: value.status,
        retryable: RETRYABLE_STATUSES.has(value.status),
      },
    };
  }

  if (value instanceof ProviderError) {
    const responseStatus = providerResponseStatus(value);
    const status = value.httpStatus ?? (value.code === 'timeout' ? 504 : undefined);
    return {
      responseStatus,
      error: compactError({
        code: value.code,
        message: value.message,
        status,
        retryable: value.retryable || (status !== undefined && RETRYABLE_STATUSES.has(status)),
        provider: value.providerId,
      }),
    };
  }

  const message = errorMessage(value);
  const status = inferHttpStatus(message);
  const fileTooLarge = objectCode(value) === 'LIMIT_FILE_SIZE';
  const networkError = isNetworkError(message);
  const resolvedStatus = fileTooLarge ? 413 : status;
  return {
    responseStatus: resolvedStatus ?? (networkError ? 502 : 500),
    error: compactError({
      code: fileTooLarge
        ? 'FILE_TOO_LARGE'
        : networkError
          ? 'NETWORK_ERROR'
          : resolvedStatus
            ? `HTTP_${resolvedStatus}`
            : 'UNKNOWN_ERROR',
      message: fileTooLarge ? '上传文件过大' : message,
      status: resolvedStatus,
      retryable: networkError || (resolvedStatus !== undefined && RETRYABLE_STATUSES.has(resolvedStatus)),
    }),
  };
}

export function serializeError(value: unknown): string {
  return JSON.stringify(resolveError(value).error);
}

export function serializeStructuredError(error: StructuredError): string {
  return JSON.stringify(compactError(error));
}

export function parseStoredError(value: string | null): StructuredError | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid error payload');
    const record = parsed as Record<string, unknown>;
    if (typeof record.message !== 'string' || typeof record.code !== 'string') throw new Error('invalid error payload');
    return compactError({
      code: record.code,
      message: record.message,
      status: typeof record.status === 'number' ? record.status : undefined,
      retryable: record.retryable === true,
      provider: typeof record.provider === 'string' ? record.provider : undefined,
    });
  } catch {
    return resolveError(new Error(value)).error;
  }
}

function providerResponseStatus(error: ProviderError): number {
  if (error.code === 'configuration' || error.code === 'unsupported_capability') return 400;
  if (error.code === 'timeout') return 504;
  return 502;
}

function inferHttpStatus(message: string): number | undefined {
  const explicit = message.match(/\b(?:HTTP|status(?:\s+code)?)[\s:：-]*(\d{3})\b/i)
    ?? message.match(/(?:状态码|状态)[\s:：-]*(\d{3})/);
  if (explicit) {
    const status = Number(explicit[1]);
    if (status >= 400 && status <= 599) return status;
  }
  if (/too many requests|rate[\s_-]*limit|请求(?:过于|太)?频繁|频率限制|限流/i.test(message)) return 429;
  if (/gateway timeout|请求超时|连接超时|\btimeout\b/i.test(message)) return 504;
  return undefined;
}

function isNetworkError(message: string): boolean {
  return /network|fetch failed|socket|econn(?:reset|refused)|enotfound|网络|连接失败/i.test(message);
}

function errorMessage(value: unknown): string {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  const text = String(value ?? '').trim();
  return text || '发生未知错误';
}

function objectCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('code' in value)) return undefined;
  return typeof value.code === 'string' ? value.code : undefined;
}

function compactError(error: StructuredError): StructuredError {
  return {
    code: error.code,
    message: error.message,
    ...(error.status === undefined ? {} : { status: error.status }),
    retryable: error.retryable,
    ...(error.provider ? { provider: error.provider } : {}),
  };
}
