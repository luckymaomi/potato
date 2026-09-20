import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderRegistry } from '../src/providers';
import { ProviderError } from '../src/providers/errors';
import type { AiServiceConfig } from '../src/types/ai';

function config(provider: string, serviceType: 'image' | 'video'): AiServiceConfig {
  return {
    id: 1,
    service_type: serviceType,
    provider,
    name: provider,
    base_url: 'https://api.example.test',
    api_key: 'key',
    model: ['model'],
    default_model: 'model',
    endpoint: '',
    query_endpoint: '',
    priority: 0,
    is_default: true,
    is_active: true,
    settings: null,
  };
}

test('内置目录只注册 Agnes 与 PearAPI', () => {
  const registry = createProviderRegistry();
  assert.deepEqual(registry.list().map((item) => item.id), ['pearapi', 'agnes']);
  assert.deepEqual(registry.list('image').map((item) => item.id), ['pearapi', 'agnes']);
  assert.deepEqual(registry.list('video').map((item) => item.id), ['pearapi', 'agnes']);
});

test('注册中心只按供应商身份选择适配器', () => {
  const registry = createProviderRegistry();
  assert.equal(registry.require({ kind: 'image', config: config('agnes', 'image'), model: 'agnes-image' }).descriptor.id, 'agnes');
  assert.equal(registry.require({ kind: 'video', config: config('pearapi', 'video'), model: 'video-model' }).descriptor.id, 'pearapi');
});

test('未知供应商明确拒绝，不走兼容协议兜底', () => {
  const registry = createProviderRegistry();
  assert.throws(
    () => registry.require({ kind: 'image', config: config('unknown-provider', 'image'), model: 'model' }),
    (error: unknown) => error instanceof ProviderError
      && error.code === 'configuration'
      && error.providerId === 'unknown-provider',
  );
});
