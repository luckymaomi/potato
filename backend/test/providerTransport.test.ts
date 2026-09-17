import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PROVIDER_TIMEOUT_MS, requestProviderJson } from '../src/providers/transport';

test('供应商生成请求默认等待十分钟', () => {
  assert.equal(DEFAULT_PROVIDER_TIMEOUT_MS, 600_000);
});

test('Provider 传输层遇到 429 后按有界策略重试', async () => {
  let attempts = 0;
  const response = await requestProviderJson<{ ok: boolean }>({
    providerId: 'test',
    url: 'https://provider.test/models',
    method: 'GET',
    maxAttempts: 2,
    retryDelayMs: 0,
  }, async () => {
    attempts += 1;
    return attempts === 1
      ? Response.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '0' } })
      : Response.json({ ok: true });
  });
  assert.equal(attempts, 2);
  assert.deepEqual(response.data, { ok: true });
});

test('Provider 传输层默认允许六次 429 尝试并在窗口内恢复', async () => {
  let attempts = 0;
  const response = await requestProviderJson<{ ok: boolean }>({
    providerId: 'test',
    url: 'https://provider.test/models',
    method: 'GET',
  }, async () => {
    attempts += 1;
    return attempts < 6
      ? Response.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '0' } })
      : Response.json({ ok: true });
  });
  assert.equal(attempts, 6);
  assert.deepEqual(response.data, { ok: true });
});

test('Provider 传输层把安全的供应商错误原因带入 HTTP 错误', async () => {
  await assert.rejects(
    requestProviderJson({
      providerId: 'test',
      url: 'https://provider.test/images',
      maxAttempts: 1,
    }, async () => Response.json({ error: { message: 'reference image is not accessible' } }, { status: 400 })),
    /供应商请求失败（HTTP 400）：reference image is not accessible/u,
  );
});

test('Provider 传输层取消时立即结束重试等待', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const request = requestProviderJson({
    providerId: 'test',
    url: 'https://provider.test/models',
    method: 'GET',
    maxAttempts: 4,
    retryDelayMs: 30_000,
    signal: controller.signal,
  }, async () => {
    attempts += 1;
    return Response.json({ error: 'rate limited' }, { status: 429 });
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort(new Error('用户停止'));

  await assert.rejects(request, /用户停止/u);
  assert.equal(attempts, 1);
});
