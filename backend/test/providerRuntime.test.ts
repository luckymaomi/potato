import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_IMAGE_POLL_POLICY, runImageProvider, submitVideoProvider } from '../src/providers/runtime';
import type { ProviderAdapter, ProviderCapabilities } from '../src/providers/contracts';
import { ProviderError } from '../src/providers/errors';
import type { AiServiceConfig } from '../src/types/ai';
import type { Logger } from '../src/types/core';

const log: Logger = { info() {}, warn() {}, error() {} };
const config: AiServiceConfig = {
  id: 1, service_type: 'image', provider: 'limited', name: 'limited',
  base_url: 'https://api.example.test', api_key: 'key', model: ['model'], default_model: 'model',
  endpoint: '', query_endpoint: '', priority: 0, is_default: true, is_active: true, settings: null,
};

function limited(capabilities: ProviderCapabilities): ProviderAdapter {
  return {
    descriptor: { id: 'limited', label: 'Limited', aliases: [], capabilities },
    submitImage: async () => ({ status: 'completed', imageUrl: 'https://cdn.test/image.png' }),
    submitVideo: async () => ({ status: 'completed', videoUrl: 'https://cdn.test/video.mp4' }),
  };
}

const baseCapabilities: ProviderCapabilities = {
  textToImage: true,
  imageToImage: false,
  textToVideo: true,
  imageToVideo: false,
  asynchronous: false,
  multipleImageReferences: false,
  firstLastFrame: false,
};

test('异步图片默认持续轮询，不设置本地累计失败截止线', () => {
  assert.deepEqual(DEFAULT_IMAGE_POLL_POLICY, { intervalMs: 5_000 });
});

test('图片运行时按能力声明拒绝图生图', async () => {
  await assert.rejects(
    runImageProvider(limited(baseCapabilities), { config, log }, {
      prompt: 'test', model: 'model', referenceImages: ['https://cdn.test/ref.png'],
    }),
    /不支持图生图/u,
  );
});

test('视频运行时按能力声明拒绝首尾帧', async () => {
  await assert.rejects(
    submitVideoProvider(limited({ ...baseCapabilities, imageToVideo: true }), { config, log }, {
      prompt: 'test', model: 'model', referenceImages: [],
      firstFrame: 'https://cdn.test/first.png', lastFrame: 'https://cdn.test/last.png',
    }),
    /不支持首尾帧/u,
  );
});

test('图片轮询遇到可重试网络错误时保持任务运行并继续查询', async () => {
  let polls = 0;
  const events: string[] = [];
  const adapter: ProviderAdapter = {
    ...limited({ ...baseCapabilities, asynchronous: true }),
    submitImage: async () => ({ status: 'queued', taskId: 'image-task' }),
    pollImage: async () => {
      polls += 1;
      if (polls === 1) {
        throw new ProviderError({ providerId: 'limited', code: 'network', message: 'fetch failed', retryable: true });
      }
      return { status: 'completed', taskId: 'image-task', imageUrl: 'https://cdn.test/image.png' };
    },
  };
  const result = await runImageProvider(adapter, {
    config,
    log: { ...log, audit(event) { events.push(event); } },
  }, {
    prompt: 'test', model: 'model', referenceImages: [],
  }, { intervalMs: 0 });

  assert.equal(result.status, 'completed');
  assert.equal(polls, 2);
  assert.deepEqual(events, ['provider.image.poll.retry']);
});
