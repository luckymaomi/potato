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
    { id: 'writer-live', label: 'Writer Live', kind: 'text' },
    { id: 'artist-live', label: 'Artist Live', kind: 'image' },
    { id: 'director-live', label: 'Director Live', kind: 'video' },
  ]);
});

test('PearAPI 动态模型目录保留公开返回的图片和视频类型', async () => {
  const adapter = createPearApiAdapter(async (input, init) => {
    assert.equal(String(input), 'https://api.pearapi.ai/v1/models');
    assert.equal(String(init?.method), 'GET');
    return new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'chat-live', model: 'Chat Live', model_type: 'chat', supported_endpoint_types: ['chat.completions'] },
        { id: 'image-live', model: 'Image Live', model_type: 'image', supported_endpoint_types: ['images.edits'] },
        { id: 'video-live', model: 'Video Live', model_type: 'video', supported_endpoint_types: ['videos.generations'] },
      ],
    }), { status: 200 });
  });

  assert.deepEqual(await adapter.listModels!({ apiKey: '' , serviceType: 'image' }), [
    { id: 'image-live', label: 'Image Live', kind: 'image' },
  ]);
  assert.deepEqual(await adapter.listModels!({ apiKey: '' , serviceType: 'video' }), [
    { id: 'video-live', label: 'Video Live', kind: 'video' },
  ]);
});
