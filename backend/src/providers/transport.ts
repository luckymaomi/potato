import { Agent, type Dispatcher } from 'undici';
import { ProviderError } from './errors';

export type ProviderFetch = typeof fetch;

export interface ProviderHttpRequest {
  providerId: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryNetworkErrors?: boolean;
  signal?: AbortSignal;
}

export interface ProviderHttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
}

const DEFAULT_MAX_ATTEMPTS = 6;
export const NO_PROVIDER_TIMEOUT_MS = 0;

export function providerDispatcherOptions(timeoutMs: number): Pick<Agent.Options, 'headersTimeout' | 'bodyTimeout'> {
  return {
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  };
}

export async function requestProviderJson<T = unknown>(
  request: ProviderHttpRequest,
  fetchImpl: ProviderFetch = fetch,
): Promise<ProviderHttpResponse<T>> {
  const timeoutMs = request.timeoutMs ?? NO_PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = timeoutMs > 0
    ? setTimeout(() => controller.abort(new Error('provider request timeout')), timeoutMs)
    : undefined;
  const abortFromCaller = () => controller.abort(request.signal?.reason);
  if (request.signal?.aborted) abortFromCaller();
  else request.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const dispatcher = fetchImpl === fetch ? new Agent(providerDispatcherOptions(timeoutMs)) : undefined;

  try {
    const maxAttempts = Math.max(1, request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response: Response;
      let raw: string;
      try {
        const init: RequestInit & { dispatcher?: Dispatcher } = {
          method: request.method ?? 'POST',
          headers: request.headers,
          body: request.body === undefined
            ? undefined
            : typeof request.body === 'string'
              ? request.body
              : JSON.stringify(request.body),
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
        };
        response = await fetchImpl(request.url, init);
        raw = await response.text();
      } catch (error) {
        if (request.signal?.aborted) throw request.signal.reason ?? error;
        const timedOut = timeoutMs > 0 && controller.signal.aborted && !request.signal?.aborted;
        const providerError = new ProviderError({
          providerId: request.providerId,
          code: timedOut ? 'timeout' : 'network',
          message: timedOut ? `供应商请求超时（${timeoutMs}ms）` : `供应商网络请求失败：${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
          cause: error,
        });
        if (request.retryNetworkErrors && !timedOut && attempt + 1 < maxAttempts) {
          await wait(networkRetryDelay(attempt, request.retryDelayMs), controller.signal);
          continue;
        }
        throw providerError;
      }

      let data: T;
      try {
        data = JSON.parse(raw) as T;
      } catch (error) {
        throw new ProviderError({
          providerId: request.providerId,
          code: 'invalid_response',
          message: `供应商返回了非 JSON 响应（HTTP ${response.status}）`,
          httpStatus: response.status,
          details: raw.slice(0, 500),
          cause: error,
        });
      }

      if (response.ok) return { status: response.status, headers: response.headers, data };
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (retryable && attempt + 1 < maxAttempts) {
        await wait(retryDelay(response, attempt, request.retryDelayMs), controller.signal);
        continue;
      }
      const detail = providerErrorDetail(data);
      throw new ProviderError({
        providerId: request.providerId,
        code: 'http_error',
        message: `供应商请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
        httpStatus: response.status,
        retryable,
        details: data,
      });
    }
    throw new ProviderError({ providerId: request.providerId, code: 'network', message: '供应商请求未完成' });
  } finally {
    if (timeout) clearTimeout(timeout);
    request.signal?.removeEventListener('abort', abortFromCaller);
    await dispatcher?.close().catch(() => undefined);
  }
}

function networkRetryDelay(attempt: number, configured?: number): number {
  return Math.min(30_000, Math.max(0, configured ?? 5_000) * (2 ** attempt));
}

function retryDelay(response: Response, attempt: number, configured?: number): number {
  const retryAfter = response.headers.get('retry-after');
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1_000);
  const date = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(date)) return Math.min(30_000, Math.max(0, date - Date.now()));
  return Math.min(30_000, Math.max(0, configured ?? 5_000) * (2 ** attempt));
}

async function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return;
  if (signal?.aborted) throw signal.reason ?? new Error('请求已取消');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason ?? new Error('请求已取消'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function providerErrorDetail(value: unknown): string | undefined {
  const root = asRecord(value);
  if (!root) return undefined;
  const error = asRecord(root.error);
  const data = asRecord(root.data);
  const candidates = [
    error?.message,
    root.detail,
    root.message,
    root.msg,
    typeof root.error === 'string' ? root.error : undefined,
    data?.detail,
    data?.message,
    data?.msg,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    return candidate.trim().replace(/\s+/gu, ' ').slice(0, 300);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
