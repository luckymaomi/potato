import assert from 'node:assert/strict';
import test from 'node:test';
import { requestProviderJson } from '../src/providers/transport';

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
