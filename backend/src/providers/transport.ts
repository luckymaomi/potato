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
  signal?: AbortSignal;
}

export interface ProviderHttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
}

export async function requestProviderJson<T = unknown>(
  request: ProviderHttpRequest,
  fetchImpl: ProviderFetch = fetch,
): Promise<ProviderHttpResponse<T>> {
  const timeoutMs = request.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('provider request timeout')), timeoutMs);
  const abortFromCaller = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const maxAttempts = Math.max(1, request.maxAttempts ?? 4);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(request.url, {
          method: request.method ?? 'POST',
          headers: request.headers,
          body: request.body === undefined
            ? undefined
            : typeof request.body === 'string'
              ? request.body
              : JSON.stringify(request.body),
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = controller.signal.aborted && !request.signal?.aborted;
        throw new ProviderError({
          providerId: request.providerId,
          code: timedOut ? 'timeout' : 'network',
          message: timedOut ? `供应商请求超时（${timeoutMs}ms）` : `供应商网络请求失败：${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
          cause: error,
        });
      }

      const raw = await response.text();
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
        await wait(retryDelay(response, attempt, request.retryDelayMs));
        continue;
      }
      throw new ProviderError({
        providerId: request.providerId,
        code: 'http_error',
        message: `供应商请求失败（HTTP ${response.status}）`,
        httpStatus: response.status,
        retryable,
        details: data,
      });
    }
    throw new ProviderError({ providerId: request.providerId, code: 'network', message: '供应商请求未完成' });
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function retryDelay(response: Response, attempt: number, configured?: number): number {
  const retryAfter = response.headers.get('retry-after');
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1_000);
  const date = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(date)) return Math.min(30_000, Math.max(0, date - Date.now()));
  return Math.min(30_000, Math.max(0, configured ?? 5_000) * (2 ** attempt));
}

async function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
