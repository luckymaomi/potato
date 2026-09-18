import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgnesAdapter } from '../src/providers/adapters/agnes';
import { createPearApiAdapter } from '../src/providers/adapters/pearApi';

test('Agnes 动态模型目录使用 GET /models 并按返回元数据分类', async () => {
  const requests: Array<{ url: string; method: string; authorization?: string }> = [];
  const adapter = createAgnesAdapter(async (input, init) => {
    requests.push({
      url: String(input),
      method: String(init?.method),
      authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
    });
    return new Response(JSON.stringify({
      data: [
        { id: 'writer-live', name: 'Writer Live', model_type: 'chat', supported_endpoint_types: ['chat.completions'] },
        { id: 'artist-live', name: 'Artist Live', model_type: 'image', supported_endpoint_types: ['images.generations'] },
        { id: 'director-live', name: 'Director Live', model_type: 'video', supported_endpoint_types: ['videos'] },
        { id: 'embedding-live', model_type: 'embedding', supported_endpoint_types: ['embeddings'] },
      ],
    }), { status: 200 });
  });

  const models = await adapter.listModels!({ apiKey: 'secret' });
  assert.equal(requests[0]?.url, 'https://apihub.agnes-ai.com/v1/models');
  assert.equal(requests[0]?.method, 'GET');
  assert.equal(requests[0]?.authorization, 'Bearer secret');
  assert.deepEqual(models, [
    {
      id: 'writer-live', label: 'Writer Live', kind: 'text',
      capabilities: { modes: [], maxReferenceImages: null, aspectRatios: [], billingMode: 'unknown', supportsDuration: false, supportedDurations: null, source: 'adapter' },
    },
    {
      id: 'artist-live', label: 'Artist Live', kind: 'image',
      capabilities: {
        modes: ['text-to-image', 'image-to-image'],
        maxReferenceImages: 8,
        aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'],
        billingMode: 'unknown', supportsDuration: false, supportedDurations: null,
        source: 'adapter',
      },
    },
    {
      id: 'director-live', label: 'Director Live', kind: 'video',
      capabilities: {
        modes: ['text-to-video', 'image-to-video'],
        maxReferenceImages: 10,
        aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
        billingMode: 'duration', supportsDuration: true, supportedDurations: null,
        source: 'adapter',
      },
    },
  ]);
});

test('PearAPI 只使用 Bearer /v1/models，并为已核验 GPT Image 2 模型补充能力', async () => {
  const requests: Array<{ url: string; method: string; authorization?: string }> = [];
  const adapter = createPearApiAdapter(async (input, init) => {
    requests.push({ url: String(input), method: String(init?.method), authorization: (init?.headers as Record<string, string> | undefined)?.Authorization });
    return Response.json({ object: 'list', data: [{ id: 'gpt-image-2', object: 'model', created: 0, owned_by: 'pearapi' }] });
  });

  assert.deepEqual(await adapter.listModels!({ apiKey: 'sk-test', serviceType: 'image' }), [
    {
      id: 'gpt-image-2', label: 'gpt-image-2', kind: 'image',
      capabilities: { modes: ['text-to-image', 'image-to-image'], maxReferenceImages: 16, aspectRatios: ['9:16', '16:9', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '2:1', '1:2', '21:9', '9:21'], billingMode: 'unknown', supportsDuration: false, supportedDurations: null, source: 'provider' },
    },
  ]);
  assert.deepEqual(requests, [{ url: 'https://api.pearapi.ai/v1/models', method: 'GET', authorization: 'Bearer sk-test' }]);
});

test('PearAPI 模型目录缺少 Bearer Token 时明确拒绝', async () => {
  const adapter = createPearApiAdapter(async () => {
    throw new Error('不应发起请求');
  });
  await assert.rejects(adapter.listModels!({ apiKey: '', serviceType: 'video' }), /PearAPI API Key不能为空/u);
});

test('PearAPI 普通模型只采用 /v1/models 明确返回的能力', async () => {
  const adapter = createPearApiAdapter(async () => Response.json({
    data: [
      { id: 'generate-only', model_type: 'image', supported_endpoint_types: ['images.generations'] },
      { id: 'edit-only', model_type: 'image', supported_endpoint_types: ['images.edits'] },
      { id: 'image-unknown', model_type: 'image' },
    ],
  }));
  assert.deepEqual(await adapter.listModels!({ apiKey: 'sk-test', serviceType: 'image' }), [
    {
      id: 'generate-only', label: 'generate-only', kind: 'image',
      capabilities: { modes: ['text-to-image'], maxReferenceImages: 0, aspectRatios: null, billingMode: 'unknown', supportsDuration: false, supportedDurations: null, source: 'provider' },
    },
    {
      id: 'edit-only', label: 'edit-only', kind: 'image',
      capabilities: { modes: ['image-to-image'], maxReferenceImages: null, aspectRatios: null, billingMode: 'unknown', supportsDuration: false, supportedDurations: null, source: 'provider' },
    },
    {
      id: 'image-unknown', label: 'image-unknown', kind: 'image',
      capabilities: { modes: [], maxReferenceImages: 0, aspectRatios: null, billingMode: 'unknown', supportsDuration: false, supportedDurations: null, source: 'provider' },
    },
  ]);
});

test('PearAPI 未知媒体模型仍保留在目录，只有已核验模型使用适配器特判', async () => {
  const adapter = createPearApiAdapter(async () => Response.json({ data: [
    { id: 'future-image-model', model_type: 'image', supported_endpoint_types: ['images.generations'] },
    { id: 'gpt-image-2', object: 'model' },
  ] }));
  const models = await adapter.listModels!({ apiKey: 'sk-test', serviceType: 'image' });
  assert.equal(models.some((model) => model.id === 'future-image-model'), true);
  assert.equal(models.find((model) => model.id === 'gpt-image-2')?.capabilities.maxReferenceImages, 16);
});

test('PearAPI 只为官方 Grok 1.5 及 preview 别名补充视频能力', async () => {
  const adapter = createPearApiAdapter(async () => Response.json({ data: [
    { id: 'grok-imagine-video-1.5', object: 'model' },
    { id: 'grok-imagine-video-1.5-preview', object: 'model' },
    { id: 'grok-imagine-video', model_type: 'video' },
  ] }));
  const models = await adapter.listModels!({ apiKey: 'sk-test', serviceType: 'video' });
  for (const id of ['grok-imagine-video-1.5', 'grok-imagine-video-1.5-preview']) {
    assert.deepEqual(models.find((model) => model.id === id)?.capabilities, {
      modes: ['text-to-video', 'image-to-video'], maxReferenceImages: 1, aspectRatios: ['16:9', '9:16'],
      billingMode: 'per-request', supportsDuration: true, supportedDurations: [4, 6, 8, 10, 12, 15], source: 'provider',
    });
  }
  assert.deepEqual(models.find((model) => model.id === 'grok-imagine-video')?.capabilities, {
    modes: ['text-to-video', 'image-to-video'], maxReferenceImages: null, aspectRatios: null,
    billingMode: 'unknown', supportsDuration: false, supportedDurations: null, source: 'provider',
  });
});
