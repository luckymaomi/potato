import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgnesAdapter, mapAgnesImageSizeSpec } from '../src/providers/adapters/agnes';
import type { AiServiceConfig } from '../src/types/ai';
import type { Logger } from '../src/types/core';

const log: Logger = { info() {}, warn() {}, error() {} };

function config(serviceType: 'image' | 'video', model: string): AiServiceConfig {
  return {
    id: 1,
    service_type: serviceType,
    provider: 'agnes',
    name: 'Agnes',
    base_url: 'https://apihub.agnes-ai.com/v1',
    api_key: 'secret',
    model: [model],
    default_model: model,
    endpoint: serviceType === 'image' ? '/images/generations' : '/videos',
    query_endpoint: '',
    priority: 0,
    is_default: true,
    is_active: true,
    settings: null,
  };
}

test('Agnes 图片适配器保留 size、ratio 和 extra_body 契约', async () => {
  const resolved: string[] = [];
  const adapter = createAgnesAdapter(async (input, init) => {
    assert.equal(String(input), 'https://apihub.agnes-ai.com/v1/images/generations');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.size, '2K');
    assert.equal(body.ratio, '9:16');
    assert.equal(body.negative_prompt, 'watermark');
    assert.deepEqual(body.extra_body, {
      response_format: 'url',
      image: ['data:image/png;base64,cmVmZXJlbmNl'],
    });
    return new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/generated.png' }] }), { status: 200 });
  });

  const result = await adapter.submitImage!({
    config: config('image', 'agnes-image-2.5-flash'),
    log,
    resolveMediaReference: async (source, options) => {
      resolved.push(`${options?.format}:${source}`);
      return 'data:image/png;base64,cmVmZXJlbmNl';
    },
  }, {
    prompt: 'portrait',
    model: 'agnes-image-2.5-flash',
    size: '2K',
    aspectRatio: '9:16',
    negativePrompt: 'watermark',
    referenceImages: ['https://cdn.test/reference.png'],
  });
  assert.deepEqual(result, { status: 'completed', imageUrl: 'https://cdn.test/generated.png' });
  assert.deepEqual(resolved, ['inline:https://cdn.test/reference.png']);
  assert.deepEqual(mapAgnesImageSizeSpec('2560x1440'), { size: '2K', ratio: '16:9' });
});

test('Agnes Video 2.5 适配器提交 reference 模式并按 video_id 轮询', async () => {
  let requestCount = 0;
  const adapter = createAgnesAdapter(async (input, init) => {
    requestCount += 1;
    if (requestCount === 1) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.mode, 'reference');
      assert.equal(body.seconds, '8');
      assert.equal(body.size, '720P');
      assert.deepEqual(body.images, ['https://cdn.test/a.png', 'https://cdn.test/b.png']);
      return new Response(JSON.stringify({ video_id: 'video_123', status: 'queued' }), { status: 200 });
    }
    assert.equal(
      String(input),
      'https://apihub.agnes-ai.com/agnesapi?video_id=video_123&model_name=agnes-video-2.5-flash',
    );
    return new Response(JSON.stringify({
      video_id: 'video_123', status: 'completed', metadata: { url: 'https://cdn.test/out.mp4' },
    }), { status: 200 });
  });
  const context = { config: config('video', 'agnes-video-2.5-flash'), log };
  const submitted = await adapter.submitVideo!(context, {
    prompt: 'move', model: 'agnes-video-2.5-flash', duration: 8, aspectRatio: '16:9', resolution: '1080p',
    referenceImages: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
  });
  assert.deepEqual(submitted, { status: 'queued', taskId: 'video_123' });
  const completed = await adapter.pollVideo!(context, 'video_123');
  assert.deepEqual(completed, {
    status: 'completed', taskId: 'video_123', videoUrl: 'https://cdn.test/out.mp4', progress: 100,
  });
});

test('Agnes Video 2.5 未指定时长时不在适配器本地伪造 seconds', async () => {
  let body: Record<string, unknown> | undefined;
  const adapter = createAgnesAdapter(async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ video_id: 'video_without_duration', status: 'queued' }), { status: 200 });
  });
  await adapter.submitVideo!({ config: config('video', 'agnes-video-2.5-flash'), log }, {
    prompt: 'move', model: 'agnes-video-2.5-flash', aspectRatio: '16:9', referenceImages: [],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'seconds'), false);
});

test('Agnes Video 2.0 适配器使用关键帧参数和标准视频查询路径', async () => {
  let requestCount = 0;
  const adapter = createAgnesAdapter(async (input, init) => {
    requestCount += 1;
    if (requestCount === 1) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.width, 1152);
      assert.equal(body.height, 768);
      assert.deepEqual(body.extra_body, {
        mode: 'keyframes',
        image: ['https://cdn.test/first.png', 'https://cdn.test/last.png'],
      });
      return new Response(JSON.stringify({ id: 'task_123', status: 'processing' }), { status: 200 });
    }
    assert.equal(String(input), 'https://apihub.agnes-ai.com/v1/videos/task_123');
    return new Response(JSON.stringify({
      id: 'task_123', status: 'completed', remixed_from_video_id: 'https://cdn.test/out-v2.mp4',
    }), { status: 200 });
  });
  const context = { config: config('video', 'agnes-video-v2.0'), log };
  const submitted = await adapter.submitVideo!(context, {
    prompt: 'move', model: 'agnes-video-v2.0', duration: 5, aspectRatio: '16:9',
    firstFrame: 'https://cdn.test/first.png', lastFrame: 'https://cdn.test/last.png', referenceImages: [],
  });
  assert.equal(submitted.taskId, 'task_123');
  const completed = await adapter.pollVideo!(context, 'task_123');
  assert.equal(completed.videoUrl, 'https://cdn.test/out-v2.mp4');
});

test('Agnes 图生视频在公网参考图解析失败时明确拒绝，不降级为文生视频', async () => {
  const adapter = createAgnesAdapter(async () => {
    throw new Error('不应发送请求');
  });
  const context = {
    config: config('video', 'agnes-video-2.5-flash'),
    log,
    resolveMediaReference: async () => undefined,
  };
  await assert.rejects(
    adapter.submitVideo!(context, {
      prompt: 'move', model: 'agnes-video-2.5-flash',
      referenceImages: ['local/reference.png'],
    }),
    /参考图解析失败/u,
  );
});
