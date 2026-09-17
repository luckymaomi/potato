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
      capabilities: { modes: [], maxReferenceImages: null, aspectRatios: [], source: 'adapter' },
    },
    {
      id: 'artist-live', label: 'Artist Live', kind: 'image',
      capabilities: {
        modes: ['text-to-image', 'image-to-image'],
        maxReferenceImages: 8,
        aspectRatios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'],
        source: 'adapter',
      },
    },
    {
      id: 'director-live', label: 'Director Live', kind: 'video',
      capabilities: {
        modes: ['text-to-video', 'image-to-video'],
        maxReferenceImages: 10,
        aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
        source: 'adapter',
      },
    },
  ]);
});

test('PearAPI 合并凭据模型目录与公开能力目录', async () => {
  const adapter = createPearApiAdapter(async (input, init) => {
    assert.equal(String(init?.method), 'GET');
    if (String(input) === 'https://api.pearapi.ai/system/auth/models/all') {
      return Response.json({
        code: 200,
        data: [
          { model_id: 'image-live', model_name: 'Image Live', model_type: 'image', channel_type: '默认', reference_image: 3, aspect_ratio: '1:1，9:16，16:9' },
          { model_id: 'video-live', model_name: 'Video Live', model_type: 'video', channel_type: '默认', reference_image: 2, aspect_ratio: '16:9，9:16', supported_modes: ['text2video', 'image2video'] },
          { model_id: 'not-permitted', model_type: 'image', reference_image: 9 },
        ],
      });
    }
    assert.equal(String(input), 'https://api.pearapi.ai/v1/models');
    return new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'chat-live', model: 'Chat Live', model_type: 'chat', supported_endpoint_types: ['chat.completions'] },
        { id: 'IMAGE-LIVE', model: 'Image Live', model_type: 'image', channel_type: '默认', supported_endpoint_types: ['images.generations', 'images.edits'] },
        { id: 'video-live', model: 'Video Live', model_type: 'video', channel_type: '默认', supported_endpoint_types: ['videos.generations'] },
      ],
    }), { status: 200 });
  });

  assert.deepEqual(await adapter.listModels!({ apiKey: '' , serviceType: 'image' }), [
    {
      id: 'IMAGE-LIVE', label: 'Image Live', kind: 'image',
      capabilities: { modes: ['text-to-image', 'image-to-image'], maxReferenceImages: 3, aspectRatios: ['1:1', '9:16', '16:9'], source: 'provider' },
    },
  ]);
  assert.deepEqual(await adapter.listModels!({ apiKey: '' , serviceType: 'video' }), [
    {
      id: 'video-live', label: 'Video Live', kind: 'video',
      capabilities: { modes: ['text-to-video', 'image-to-video'], maxReferenceImages: 2, aspectRatios: ['16:9', '9:16'], source: 'provider' },
    },
  ]);
});

test('PearAPI 丰富目录不可用时保留凭据可用模型并明确未知上限', async () => {
  const adapter = createPearApiAdapter(async (input) => {
    if (String(input).endsWith('/system/auth/models/all')) return new Response('unavailable', { status: 503 });
    return Response.json({
      data: [
        { id: 'generate-only', model_type: 'image', supported_endpoint_types: ['images.generations'] },
        { id: 'edit-only', model_type: 'image', supported_endpoint_types: ['images.edits'] },
      ],
    });
  });
  assert.deepEqual(await adapter.listModels!({ apiKey: '', serviceType: 'image' }), [
    {
      id: 'generate-only', label: 'generate-only', kind: 'image',
      capabilities: { modes: ['text-to-image'], maxReferenceImages: 0, aspectRatios: null, source: 'provider' },
    },
    {
      id: 'edit-only', label: 'edit-only', kind: 'image',
      capabilities: { modes: ['image-to-image'], maxReferenceImages: null, aspectRatios: null, source: 'provider' },
    },
  ]);
});
