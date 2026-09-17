import assert from 'node:assert/strict';
import test from 'node:test';
import { createPearApiAdapter } from '../src/providers/adapters/pearApi';
import { ProviderError } from '../src/providers/errors';
import { runImageProvider } from '../src/providers/runtime';
import type { AiServiceConfig } from '../src/types/ai';
import type { Logger } from '../src/types/core';

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function config(serviceType: 'image' | 'video', settings: AiServiceConfig['settings'] = null): AiServiceConfig {
  return {
    id: 1,
    service_type: serviceType,
    provider: 'pearapi',
    name: 'PearAPI test',
    base_url: 'https://api.example.test',
    api_key: 'test-key',
    model: ['test-model'],
    default_model: 'test-model',
    endpoint: serviceType === 'image' ? '/api/image_generate' : '/api/video_generate',
    query_endpoint: '',
    priority: 0,
    is_default: true,
    is_active: true,
    settings,
  };
}

function fetchQueue(
  responses: Array<{ status?: number; body: unknown; contentType?: string }>,
  requests: Array<{ url: string; body: Record<string, unknown> }>,
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
    });
    const body = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return new Response(body, {
      status: next.status ?? 200,
      headers: { 'Content-Type': next.contentType ?? 'application/json' },
    });
  }) as typeof fetch;
}

test('PearAPI 同步图片归一化为 completed，并保留图生图参考图', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const adapter = createPearApiAdapter(fetchQueue([
    { body: { code: 200, data: { status: 'completed', image_urls: ['https://cdn.test/image.png'] } } },
  ], requests));
  const result = await runImageProvider(adapter, {
    config: config('image', { generation_key: 'generation-key' }),
    log: silentLogger,
    resolveMediaReference: async (_source, options) => {
      assert.equal(options?.format, 'inline');
      return 'data:image/png;base64,cmVmZXJlbmNl';
    },
  }, {
    prompt: '雨夜街道',
    model: 'test-model',
    aspectRatio: '9:16',
    referenceImages: ['https://cdn.test/reference.png'],
  });
  assert.deepEqual(result, { status: 'completed', imageUrl: 'https://cdn.test/image.png' });
  assert.equal(requests[0].url, 'https://api.example.test/api/image_generate');
  assert.deepEqual(requests[0].body.images, ['data:image/png;base64,cmVmZXJlbmNl']);
  assert.equal(requests[0].body.size, '9:16');
  assert.equal(requests[0].body.key, 'generation-key');
});

test('PearAPI 文本模型使用实时目录声明的 chat completions 协议', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const adapter = createPearApiAdapter(fetchQueue([
    { body: { choices: [{ message: { content: '动态文本结果' } }] } },
  ], requests));
  const textConfig = { ...config('image'), service_type: 'text' as const, endpoint: '/v1/chat/completions' };
  const result = await adapter.generateText!({ config: textConfig, log: silentLogger }, {
    model: 'chat-live',
    messages: [{ role: 'user', content: '写一个开场' }],
  });
  assert.deepEqual(result, { status: 'completed', text: '动态文本结果' });
  assert.equal(requests[0].url, 'https://api.example.test/v1/chat/completions');
  assert.equal(requests[0].body.model, 'chat-live');
});

test('PearAPI 异步图片由统一运行时轮询到完成', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const adapter = createPearApiAdapter(fetchQueue([
    { body: { code: 200, data: { status: 'queued', task_id: 'image-task' } } },
    { body: { code: 200, data: { status: 'completed', task_id: 'image-task', image_urls: ['https://cdn.test/final.png'] } } },
  ], requests));
  const result = await runImageProvider(adapter, {
    config: config('image', { task_type: 'async', generation_key: 'generation-key' }),
    log: silentLogger,
  }, {
    prompt: '山谷',
    model: 'test-model',
    referenceImages: [],
  }, { intervalMs: 0, maxAttempts: 2 });
  assert.equal(result.status, 'completed');
  assert.equal(result.imageUrl, 'https://cdn.test/final.png');
  assert.equal(requests[0].body.task_type, 'async');
  assert.equal(requests[1].body.task_id, 'image-task');
});

test('PearAPI 视频提交和轮询使用普通分发 Key', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const adapter = createPearApiAdapter(fetchQueue([
    { body: { code: 200, data: { status: 'queued', task_id: 'video-task' } } },
    { body: { code: 200, data: { status: 'completed', task_id: 'video-task', progress: 100, api_file_url: 'https://cdn.test/video.mp4' } } },
  ], requests));
  const context = { config: config('video', { generation_key: 'generation-key' }), log: silentLogger };
  const submitted = await adapter.submitVideo!(context, {
    prompt: '人物转身',
    model: 'test-model',
    aspectRatio: '9:16',
    image: 'https://cdn.test/start.png',
    referenceImages: [],
  });
  const completed = await adapter.pollVideo!(context, submitted.taskId!);
  assert.deepEqual(submitted, { status: 'queued', taskId: 'video-task' });
  assert.deepEqual(completed, {
    status: 'completed',
    taskId: 'video-task',
    videoUrl: 'https://cdn.test/video.mp4',
    progress: 100,
  });
  assert.deepEqual(requests[0].body.images, ['https://cdn.test/start.png']);
  assert.equal(requests[0].body.key, 'generation-key');
  assert.equal(requests[1].body.taskid, 'video-task');
  assert.equal(requests[1].body.key, 'generation-key');
});

test('PearAPI 非 200 业务码映射为 business_error', async () => {
  const adapter = createPearApiAdapter(fetchQueue([
    { body: { code: 401, msg: 'invalid key' } },
  ], []));
  await assert.rejects(
    adapter.submitImage!({ config: config('image', { generation_key: 'generation-key' }), log: silentLogger }, {
      prompt: 'test', model: 'test-model', referenceImages: [],
    }),
    (error: unknown) => error instanceof ProviderError
      && error.code === 'business_error'
      && /invalid key/i.test(error.message),
  );
});

test('PearAPI 非 JSON 和缺少媒体事实均明确失败', async () => {
  const nonJson = createPearApiAdapter(fetchQueue([{ body: '<html>bad gateway</html>' }], []));
  await assert.rejects(
    nonJson.submitImage!({ config: config('image', { generation_key: 'generation-key' }), log: silentLogger }, {
      prompt: 'test', model: 'test-model', referenceImages: [],
    }),
    (error: unknown) => error instanceof ProviderError && error.code === 'invalid_response',
  );

  const missing = createPearApiAdapter(fetchQueue([{ body: { code: 200, data: {} } }], []));
  await assert.rejects(
    missing.submitVideo!({ config: config('video', { generation_key: 'generation-key' }), log: silentLogger }, {
      prompt: 'test', model: 'test-model', referenceImages: [],
    }),
    /未返回视频地址或任务 ID/,
  );
});

test('PearAPI 图片和视频缺少普通分发 Key 时不回退到 sk 令牌', async () => {
  const adapter = createPearApiAdapter(fetchQueue([], []));
  await assert.rejects(
    adapter.submitImage!({ config: config('image'), log: silentLogger }, {
      prompt: 'test', model: 'test-model', referenceImages: [],
    }),
    (error: unknown) => error instanceof ProviderError
      && error.code === 'configuration'
      && /普通分发 Key 未配置/.test(error.message)
      && /不能使用 \/v1 的 sk- 令牌代替/.test(error.message),
  );
});
