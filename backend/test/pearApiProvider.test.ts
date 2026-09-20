import assert from 'node:assert/strict';
import test from 'node:test';
import { createPearApiAdapter } from '../src/providers/adapters/pearApi';
import { ProviderError } from '../src/providers/errors';
import { runImageProvider } from '../src/providers/runtime';
import type { AiServiceConfig } from '../src/types/ai';
import type { Logger } from '../src/types/core';

const log: Logger = { info() {}, warn() {}, error() {} };
function config(serviceType: 'image' | 'video'): AiServiceConfig { return { id: 1, service_type: serviceType, provider: 'pearapi', name: 'PearAPI', base_url: 'https://api.example.test', api_key: 'sk-test', model: ['test-model'], default_model: 'test-model', endpoint: '', query_endpoint: '', priority: 0, is_default: true, is_active: true, settings: null }; }
interface CapturedRequest { url: string; method: string; authorization?: string; body: Record<string, unknown> }
function queue(responses: Array<{ status?: number; body: unknown }>, requests: CapturedRequest[]): typeof fetch { return (async (input, init) => { const next = responses.shift(); if (!next) throw new Error('unexpected request'); requests.push({ url: String(input), method: String(init?.method || 'POST'), authorization: (init?.headers as Record<string, string> | undefined)?.Authorization, body: init?.body ? JSON.parse(String(init.body)) : {} }); return Response.json(next.body, { status: next.status || 200 }); }) as typeof fetch; }

test('PearAPI 图片使用官方 v1 异步合同与 Bearer 鉴权', async () => {
  const requests: CapturedRequest[] = [];
  const adapter = createPearApiAdapter(queue([{ body: { id: 'img-1', status: 'queued', model: 'test-model' } }, { body: { id: 'img-1', status: 'completed', progress: 100, output: { image_urls: ['https://cdn.test/image.png'] } } }], requests));
  const result = await runImageProvider(adapter, { config: config('image'), log }, { prompt: 'rain', model: 'test-model', aspectRatio: '1:1', referenceImages: ['https://cdn.test/ref.png'] }, { intervalMs: 0 });
  assert.equal(result.imageUrl, 'https://cdn.test/image.png');
  assert.equal(requests[0].url, 'https://api.example.test/v1/images/generations');
  assert.equal(requests[0].authorization, 'Bearer sk-test');
  assert.equal(requests[1].url, 'https://api.example.test/v1/images/tasks/img-1');
  assert.deepEqual(requests[0].body.reference_contents, undefined);
  assert.equal(requests[0].body.image, 'https://cdn.test/ref.png');
});

test('PearAPI 视频传递 Grok 官方 mode、seconds、images 并按官方路径轮询', async () => {
  const requests: CapturedRequest[] = [];
  const adapter = createPearApiAdapter(queue([{ body: { task_id: 'vid-1', status: 'queued' } }, { body: { task_id: 'vid-1', status: 'completed', url: 'https://cdn.test/video.mp4', format: 'mp4' } }], requests));
  const context = { config: config('video'), log, resolveMediaReference: async (source: string) => source };
  const submitted = await adapter.submitVideo!(context, { prompt: 'walk', model: 'grok-imagine-video-1.5', duration: 15, aspectRatio: '16:9', resolution: '1080p', seed: 42, image: 'https://cdn.test/start.png', referenceImages: [] });
  const completed = await adapter.pollVideo!(context, submitted.taskId!, undefined);
  assert.equal(requests[0].url, 'https://api.example.test/v1/video/generations');
  assert.equal(requests[0].authorization, 'Bearer sk-test');
  assert.deepEqual(requests[0].body, {
    model: 'grok-imagine-video-1.5', prompt: 'walk', mode: 'image2video', seconds: 15,
    aspect_ratio: '16:9', images: ['https://cdn.test/start.png'],
  });
  assert.equal(requests[1].url, 'https://api.example.test/v1/video/generations/vid-1');
  assert.equal(completed.videoUrl, 'https://cdn.test/video.mp4');
});

test('PearAPI 官方 error envelope 映射为供应商错误', async () => {
  const adapter = createPearApiAdapter(queue([{ status: 422, body: { error: { code: 'validation_failed', message: '当前模型不支持该时长' } } }], []));
  await assert.rejects(adapter.submitVideo!({ config: config('video'), log }, { prompt: 'test', model: 'test-model', duration: 15, referenceImages: [] }), (error: unknown) => error instanceof ProviderError && /当前模型不支持该时长/.test(error.message));
});
