import type {
  ImageProviderRequest,
  ImageProviderResult,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderTaskStatus,
  VideoProviderRequest,
  VideoProviderResult,
} from './contracts';
import { ProviderError } from './errors';

export interface PollPolicy {
  intervalMs: number;
}

const DEFAULT_IMAGE_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_IMAGE_POLL_POLICY: PollPolicy = {
  intervalMs: DEFAULT_IMAGE_POLL_INTERVAL_MS,
};

export async function runImageProvider(
  adapter: ProviderAdapter,
  context: ProviderExecutionContext,
  request: ImageProviderRequest,
  policy: PollPolicy = DEFAULT_IMAGE_POLL_POLICY,
): Promise<ImageProviderResult> {
  if (!adapter.submitImage) throw unsupported(adapter, '图片生成');
  assertImageCapabilities(adapter, request);
  let result = await adapter.submitImage(context, request);
  assertImageResult(adapter, result);
  if (result.status === 'completed' || result.status === 'failed') return result;
  if (!result.taskId || !adapter.pollImage) {
    throw new ProviderError({
      providerId: adapter.descriptor.id,
      code: 'invalid_response',
      message: '异步图片任务缺少任务 ID 或轮询实现',
    });
  }
  const taskId = result.taskId;
  for (let attempt = 0; ; attempt += 1) {
    await wait(policy.intervalMs, request.signal);
    try {
      result = await adapter.pollImage(context, taskId, request.signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason ?? error;
      if (error instanceof ProviderError && error.retryable) {
        context.log.audit?.('provider.image.poll.retry', {
          provider: adapter.descriptor.id,
          taskId,
          attempt: attempt + 1,
          code: error.code,
          message: error.message,
        });
        continue;
      }
      throw error;
    }
    assertImageResult(adapter, result);
    if (result.status === 'completed' || result.status === 'failed') return result;
  }
}

export async function submitVideoProvider(
  adapter: ProviderAdapter,
  context: ProviderExecutionContext,
  request: VideoProviderRequest,
): Promise<VideoProviderResult> {
  if (!adapter.submitVideo) throw unsupported(adapter, '视频生成');
  assertVideoCapabilities(adapter, request);
  const result = await adapter.submitVideo(context, request);
  assertVideoResult(adapter, result);
  return result;
}

function assertImageCapabilities(adapter: ProviderAdapter, request: ImageProviderRequest): void {
  const capabilities = adapter.descriptor.capabilities;
  if (request.referenceImages.length > 0) {
    if (!capabilities.imageToImage) throw unsupported(adapter, '图生图');
    if (request.referenceImages.length > 1 && !capabilities.multipleImageReferences) {
      throw unsupported(adapter, '多参考图生图');
    }
    return;
  }
  if (!capabilities.textToImage) throw unsupported(adapter, '文生图');
}

function assertVideoCapabilities(adapter: ProviderAdapter, request: VideoProviderRequest): void {
  const capabilities = adapter.descriptor.capabilities;
  const references = [request.image, request.firstFrame, request.lastFrame, ...request.referenceImages]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (request.firstFrame && request.lastFrame && !capabilities.firstLastFrame) {
    throw unsupported(adapter, '首尾帧视频');
  }
  if (references.length > 0) {
    if (!capabilities.imageToVideo) throw unsupported(adapter, '图生视频');
    if (references.length > 1 && !capabilities.multipleImageReferences && !(request.firstFrame && request.lastFrame)) {
      throw unsupported(adapter, '多参考图生视频');
    }
    return;
  }
  if (!capabilities.textToVideo) throw unsupported(adapter, '文生视频');
}

export async function pollVideoProvider(
  adapter: ProviderAdapter,
  context: ProviderExecutionContext,
  taskId: string,
  signal?: AbortSignal,
  model?: string,
): Promise<VideoProviderResult> {
  if (!adapter.pollVideo) throw unsupported(adapter, '视频任务轮询');
  const result = await adapter.pollVideo(context, taskId, signal, model);
  assertVideoResult(adapter, result);
  return result;
}

function assertImageResult(adapter: ProviderAdapter, result: ImageProviderResult): void {
  assertStatus(adapter, result.status);
  if (result.status === 'completed' && !result.imageUrl) {
    throw invalidResult(adapter, '图片任务完成但没有图片地址');
  }
  if ((result.status === 'queued' || result.status === 'running') && !result.taskId) {
    throw invalidResult(adapter, '异步图片任务没有任务 ID');
  }
}

function assertVideoResult(adapter: ProviderAdapter, result: VideoProviderResult): void {
  assertStatus(adapter, result.status);
  if (result.status === 'completed' && !result.videoUrl) {
    throw invalidResult(adapter, '视频任务完成但没有视频地址');
  }
  if ((result.status === 'queued' || result.status === 'running') && !result.taskId) {
    throw invalidResult(adapter, '异步视频任务没有任务 ID');
  }
}

function assertStatus(adapter: ProviderAdapter, status: ProviderTaskStatus): void {
  if (!['queued', 'running', 'completed', 'failed'].includes(status)) {
    throw invalidResult(adapter, `未知任务状态：${String(status)}`);
  }
}

function invalidResult(adapter: ProviderAdapter, message: string): ProviderError {
  return new ProviderError({ providerId: adapter.descriptor.id, code: 'invalid_response', message });
}

function unsupported(adapter: ProviderAdapter, capability: string): ProviderError {
  return new ProviderError({
    providerId: adapter.descriptor.id,
    code: 'unsupported_capability',
    message: `${adapter.descriptor.label} 不支持${capability}`,
  });
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason ?? new Error('请求已取消');
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason ?? new Error('请求已取消'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
