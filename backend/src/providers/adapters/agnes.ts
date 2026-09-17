import type {
  ImageProviderRequest,
  ImageProviderResult,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderModel,
  ProviderModelCapabilities,
  ProviderModelDiscoveryInput,
  ProviderTaskStatus,
  TextProviderRequest,
  TextProviderResult,
  VideoProviderRequest,
  VideoProviderResult,
} from '../contracts';
import { modelCapabilities } from '../modelCapabilities';
import { ProviderError } from '../errors';
import { requestProviderJson, type ProviderFetch } from '../transport';

const IMAGE_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ['1:1', 1],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['21:9', 21 / 9],
];
const VIDEO_25_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ['16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['1:1', 1],
  ['3:4', 3 / 4],
  ['9:16', 9 / 16],
];
const VIDEO_20_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1152, height: 768 },
  '9:16': { width: 768, height: 1152 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '1:1': { width: 768, height: 768 },
  '21:9': { width: 1344, height: 576 },
};
const VIDEO_20_FRAME_COUNTS = [81, 121, 161, 241, 441] as const;

export function createAgnesAdapter(fetchImpl: ProviderFetch = fetch): ProviderAdapter {
  return {
    descriptor: {
      id: 'agnes',
      label: 'Agnes AI',
      aliases: [],
      capabilities: {
        text: true,
        textToImage: true,
        imageToImage: true,
        textToVideo: true,
        imageToVideo: true,
        asynchronous: true,
        multipleImageReferences: true,
        firstLastFrame: true,
      },
      configuration: {
        defaultBaseUrl: 'https://apihub.agnes-ai.com/v1',
        endpoints: {
          text: { submit: '/chat/completions' },
          image: { submit: '/images/generations' },
          video: { submit: '/videos', query: '/videos/{taskId}' },
        },
      },
    },
    listModels: (input) => listModels(input, fetchImpl),
    generateText: (context, request) => generateText(context, request, fetchImpl),
    submitImage: (context, request) => submitImage(context, request, fetchImpl),
    submitVideo: (context, request) => submitVideo(context, request, fetchImpl),
    pollVideo: (context, taskId, signal, model) => pollVideo(context, taskId, signal, model, fetchImpl),
  };
}

async function listModels(
  input: ProviderModelDiscoveryInput,
  fetchImpl: ProviderFetch,
): Promise<ProviderModel[]> {
  const baseUrl = String(input.baseUrl || 'https://apihub.agnes-ai.com/v1').replace(/\/+$/u, '');
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'agnes',
    url: `${baseUrl}/models`,
    method: 'GET',
    headers: bearerHeaders(input.apiKey),
    timeoutMs: 30_000,
    signal: input.signal,
  }, fetchImpl);
  const items = Array.isArray(response.data.data) ? response.data.data : [];
  const models = items
    .map((item) => normalizeAgnesModel(item))
    .filter((model): model is ProviderModel => Boolean(model))
    .filter((model) => !input.serviceType || model.kind === input.serviceType);
  if (!models.length) throw invalid('Agnes 模型目录没有返回当前服务可用的模型', response.data);
  return models;
}

function normalizeAgnesModel(value: unknown): ProviderModel | undefined {
  const item = asRecord(value);
  const id = readString(item?.id);
  if (!id) return undefined;
  const rawType = readString(item?.model_type)?.toLowerCase();
  if (rawType === 'embedding') return undefined;
  const kind = rawType === 'image'
    ? 'image'
    : rawType === 'video'
      ? 'video'
      : rawType === 'chat'
        ? 'text'
        : /(?:^|-)image(?:-|$)/iu.test(id)
          ? 'image'
          : /(?:^|-)video(?:-|$)/iu.test(id)
            ? 'video'
            : /(?:^|-)embedding(?:-|$)/iu.test(id) ? undefined : 'text';
  if (!kind) return undefined;
  return {
    id,
    label: readString(item?.name) || readString(item?.model) || id,
    kind,
    capabilities: agnesModelCapabilities(id, kind),
  };
}

function agnesModelCapabilities(id: string, kind: 'text' | 'image' | 'video'): ProviderModelCapabilities {
  if (kind === 'image') {
    return modelCapabilities(
      ['text-to-image', 'image-to-image'],
      8,
      IMAGE_RATIOS.map(([ratio]) => ratio),
      'adapter',
    );
  }
  if (kind === 'video') {
    const maxReferences = /agnes-video-2\.5-flash/iu.test(id)
      ? 5
      : /agnes-video-2\.5/iu.test(id) ? 9 : 10;
    const aspectRatios = isVideo25(id)
      ? VIDEO_25_RATIOS.map(([ratio]) => ratio)
      : Object.keys(VIDEO_20_DIMENSIONS);
    return modelCapabilities(['text-to-video', 'image-to-video'], maxReferences, aspectRatios, 'adapter');
  }
  return modelCapabilities([], null, [], 'adapter');
}

async function generateText(
  context: ProviderExecutionContext,
  request: TextProviderRequest,
  fetchImpl: ProviderFetch,
): Promise<TextProviderResult> {
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'agnes',
    url: endpoint(context, '/chat/completions'),
    headers: bearerHeaders(context.config.api_key),
    body: {
      model: required(request.model, '文本模型'),
      messages: request.messages,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
    timeoutMs: 600_000,
    signal: request.signal,
  }, fetchImpl);
  const choices = Array.isArray(response.data.choices) ? response.data.choices : [];
  const first = asRecord(choices[0]);
  const message = asRecord(first?.message);
  const text = readString(message?.content) || readString(first?.text) || readString(response.data.output_text);
  if (!text) throw invalid('Agnes 文本响应没有返回内容', response.data);
  return { status: 'completed', text };
}

async function submitImage(
  context: ProviderExecutionContext,
  request: ImageProviderRequest,
  fetchImpl: ProviderFetch,
): Promise<ImageProviderResult> {
  assertReferenceLimit(request.model, 'image', request.referenceImages);
  const size = mapAgnesImageSizeSpec(request.size);
  const aspectRatio = requireAgnesAspectRatio(request.model, 'image', request.aspectRatio || size.ratio);
  const references = await resolveImageReferences(context, request.referenceImages);
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'agnes',
    url: endpoint(context, '/images/generations'),
    headers: bearerHeaders(context.config.api_key),
    body: {
      model: required(request.model, '图片模型'),
      prompt: required(request.prompt, '图片提示词'),
      size: size.size,
      ratio: aspectRatio,
      ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      extra_body: {
        response_format: 'url',
        ...(references.length ? { image: references } : {}),
      },
    },
    timeoutMs: 600_000,
    signal: request.signal,
  }, fetchImpl);
  const root = response.data;
  const item = Array.isArray(root.data) ? asRecord(root.data[0]) : undefined;
  const encoded = readString(item?.b64_json) || readString(root.b64_json);
  const imageUrl = readString(item?.url)
    || readString(root.url)
    || (encoded ? `data:image/png;base64,${encoded.replace(/\s/gu, '')}` : undefined);
  if (!imageUrl) throw invalid('Agnes 图片响应未返回 URL 或 Base64 图片', root);
  return { status: 'completed', imageUrl };
}

async function submitVideo(
  context: ProviderExecutionContext,
  request: VideoProviderRequest,
  fetchImpl: ProviderFetch,
): Promise<VideoProviderResult> {
  const references = unique(await Promise.all(request.referenceImages.map((source, index) =>
    resolveMedia(context, source, 'public-url', `reference_${index}`))));
  const firstFrame = await resolveMedia(context, readString(request.firstFrame) || readString(request.image), 'public-url', 'first_frame');
  const lastFrame = await resolveMedia(context, readString(request.lastFrame), 'public-url', 'last_frame');
  if (request.referenceImages.length > 0 && references.length === 0) {
    throw new ProviderError({
      providerId: 'agnes',
      code: 'configuration',
      message: 'Agnes 视频参考图解析失败，需要可公网访问的图片地址',
    });
  }
  if ((request.firstFrame || request.image) && !firstFrame) {
    throw new ProviderError({
      providerId: 'agnes',
      code: 'configuration',
      message: 'Agnes 视频首帧解析失败，需要可公网访问的图片地址',
    });
  }
  if (request.lastFrame && !lastFrame) {
    throw new ProviderError({
      providerId: 'agnes',
      code: 'configuration',
      message: 'Agnes 视频尾帧解析失败，需要可公网访问的图片地址',
    });
  }
  assertReferenceLimit(request.model, 'video', unique([...references, firstFrame, lastFrame]));
  requireAgnesAspectRatio(request.model, 'video', request.aspectRatio);
  const body = isVideo25(request.model)
    ? buildVideo25Body(request, references, firstFrame, lastFrame)
    : buildVideo20Body(request, references, firstFrame, lastFrame);
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'agnes',
    url: endpoint(context, '/videos'),
    headers: bearerHeaders(context.config.api_key),
    body,
    timeoutMs: 600_000,
    signal: request.signal,
  }, fetchImpl);
  return normalizeVideo(response.data);
}

async function pollVideo(
  context: ProviderExecutionContext,
  taskId: string,
  signal: AbortSignal | undefined,
  model: string | undefined,
  fetchImpl: ProviderFetch,
): Promise<VideoProviderResult> {
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'agnes',
    url: pollEndpoint(context, taskId, model),
    method: 'GET',
    headers: bearerHeaders(context.config.api_key),
    timeoutMs: 120_000,
    signal,
  }, fetchImpl);
  return normalizeVideo(response.data, taskId);
}

export function mapAgnesImageSizeSpec(size: string | undefined): { size: string; ratio: string } {
  const raw = String(size || '').trim();
  const tier = raw.match(/^([1-4])[Kk]$/u);
  if (tier) return { size: `${tier[1]}K`, ratio: '1:1' };
  const dimensions = raw.toLowerCase().replace(/\*/gu, 'x').match(/^(\d+)\s*x\s*(\d+)$/u);
  if (!dimensions) return { size: '2K', ratio: '1:1' };
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  if (!width || !height) return { size: '2K', ratio: '1:1' };
  const max = Math.max(width, height);
  return {
    size: max >= 3500 ? '3K' : max >= 1600 ? '2K' : '1K',
    ratio: closestRatio(width / height, IMAGE_RATIOS, '1:1'),
  };
}

function buildVideo25Body(
  request: VideoProviderRequest,
  references: string[],
  firstFrame: string | undefined,
  lastFrame: string | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model || 'agnes-video-2.5-flash',
    prompt: request.prompt,
    seconds: String(clamp(Math.round(request.duration || 5), 4, 12)),
    size: /agnes-video-2\.5-flash/iu.test(request.model)
      ? '720P'
      : /2K|1080|1440|2160|4K/iu.test(request.resolution || '') ? '2K' : '720P',
    aspect_ratio: request.aspectRatio || '16:9',
  };
  if (references.length) {
    body.mode = 'reference';
    body.images = references;
  } else if (firstFrame || lastFrame) {
    body.mode = 'keyframe';
    if (firstFrame) body.first_frame = firstFrame;
    if (lastFrame && lastFrame !== firstFrame) body.last_frame = lastFrame;
  } else {
    body.mode = 'text';
  }
  return body;
}

function buildVideo20Body(
  request: VideoProviderRequest,
  references: string[],
  firstFrame: string | undefined,
  lastFrame: string | undefined,
): Record<string, unknown> {
  const dimensions = VIDEO_20_DIMENSIONS[request.aspectRatio || '16:9'];
  const targetFrames = Math.round((request.duration || 5) * 24);
  const numFrames = VIDEO_20_FRAME_COUNTS.reduce((best, current) =>
    Math.abs(current - targetFrames) < Math.abs(best - targetFrames) ? current : best);
  const body: Record<string, unknown> = {
    model: request.model || 'agnes-video-v2.0',
    prompt: request.prompt,
    ...dimensions,
    num_frames: numFrames,
    frame_rate: 24,
  };
  if (references.length > 1) body.extra_body = { image: references };
  else if (references.length === 1) body.image = references[0];
  else if (firstFrame && lastFrame && firstFrame !== lastFrame) {
    body.extra_body = { mode: 'keyframes', image: [firstFrame, lastFrame] };
  } else if (firstFrame) body.image = firstFrame;
  return body;
}

function pollEndpoint(context: ProviderExecutionContext, taskId: string, explicitModel?: string): string {
  const model = readString(explicitModel)
    || readString(context.config.default_model)
    || (Array.isArray(context.config.model) ? readString(context.config.model[0]) : undefined)
    || '';
  const configured = readString(context.config.query_endpoint);
  if (configured && !isBuiltinQueryEndpoint(configured)) {
    const path = replaceTaskTemplate(configured, taskId, model);
    return absoluteUrl(context.config.base_url, path);
  }
  const root = agnesRoot(context.config.base_url);
  if (isVideo25(model)) {
    return `${root}/agnesapi?${new URLSearchParams({ video_id: taskId, model_name: model }).toString()}`;
  }
  return `${root}/v1/videos/${encodeURIComponent(taskId)}`;
}

function normalizeVideo(data: Record<string, unknown>, expectedTaskId?: string): VideoProviderResult {
  const nestedData = asRecord(data.data);
  const metadata = asRecord(data.metadata) || asRecord(nestedData?.metadata);
  const taskId = readString(data.video_id)
    || readString(data.id)
    || readString(data.task_id)
    || readString(nestedData?.video_id)
    || readString(nestedData?.id)
    || readString(nestedData?.task_id)
    || expectedTaskId;
  const videoUrl = firstHttpUrl([
    data.video_url,
    nestedData?.video_url,
    nestedData?.url,
    metadata?.url,
    metadata?.video_url,
    metadata?.result_url,
    data.remixed_from_video_id,
    nestedData?.remixed_from_video_id,
    data.url,
  ]);
  const status = normalizeStatus(data.status || nestedData?.status, videoUrl);
  if (status === 'failed') {
    return compact({ status, taskId, error: readError(data) || 'Agnes 视频生成失败' });
  }
  if (videoUrl) return compact({ status: 'completed' as const, taskId, videoUrl, progress: 100 });
  if (taskId) {
    return compact({
      status,
      taskId,
      progress: typeof data.progress === 'number'
        ? data.progress
        : typeof nestedData?.progress === 'number' ? nestedData.progress : undefined,
    });
  }
  throw invalid('Agnes 视频响应未返回视频地址或任务 ID', data);
}

function normalizeStatus(value: unknown, mediaUrl?: string): ProviderTaskStatus {
  if (mediaUrl) return 'completed';
  const status = readString(value)?.toLowerCase();
  if (['completed', 'success', 'succeeded', 'done'].includes(status || '')) return 'completed';
  if (['failed', 'error', 'canceled', 'cancelled'].includes(status || '')) return 'failed';
  if (['running', 'processing', 'in_progress'].includes(status || '')) return 'running';
  return 'queued';
}

function endpoint(context: ProviderExecutionContext, fallback: string): string {
  return absoluteUrl(context.config.base_url, readString(context.config.endpoint) || fallback);
}

function absoluteUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;
  return `${String(baseUrl || '').replace(/\/+$/u, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

function agnesRoot(baseUrl: string): string {
  return String(baseUrl || 'https://apihub.agnes-ai.com')
    .replace(/\/+$/u, '')
    .replace(/\/v1\/videos$/iu, '')
    .replace(/\/v1$/iu, '');
}

function isBuiltinQueryEndpoint(value: string): boolean {
  return /^\/?(?:v1\/)?videos\/\{(?:taskId|task_id|id|videoId|video_id)\}\/?$/iu.test(value)
    || /^\/?agnesapi(?:\?|$)/iu.test(value);
}

function replaceTaskTemplate(template: string, taskId: string, model: string): string {
  return template
    .replace(/\{(?:videoId|video_id|taskId|task_id|id)\}/giu, encodeURIComponent(taskId))
    .replace(/\{(?:model|model_name)\}/giu, encodeURIComponent(model));
}

function isVideo25(model: string): boolean {
  return /agnes-video-2\.5/iu.test(model);
}

function closestRatio(
  ratio: number,
  candidates: ReadonlyArray<readonly [string, number]>,
  fallback: string,
): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return fallback;
  return candidates.reduce(
    (best, current) => Math.abs(Math.log(ratio) - Math.log(current[1]))
      < Math.abs(Math.log(ratio) - Math.log(best[1])) ? current : best,
  )[0];
}

function bearerHeaders(apiKey: string): Record<string, string> {
  if (!readString(apiKey)) {
    throw new ProviderError({ providerId: 'agnes', code: 'configuration', message: 'Agnes API Key 未配置' });
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

function required(value: unknown, label: string): string {
  const text = readString(value);
  if (text) return text;
  throw new ProviderError({ providerId: 'agnes', code: 'configuration', message: `${label}不能为空` });
}

function readError(data: Record<string, unknown>): string | undefined {
  const error = asRecord(data.error);
  return readString(error?.message)
    || readString(data.error)
    || readString(data.detail)
    || readString(data.message);
}

function firstHttpUrl(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = readString(value);
    if (text && /^https?:\/\//iu.test(text)) return text;
  }
  return undefined;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(readString).filter((value): value is string => Boolean(value)))];
}

async function resolveMedia(
  context: ProviderExecutionContext,
  source: string | undefined,
  format: 'inline' | 'public-url',
  label: string,
): Promise<string | undefined> {
  if (!source) return undefined;
  return context.resolveMediaReference
    ? context.resolveMediaReference(source, { format, label })
    : source;
}

async function resolveImageReferences(
  context: ProviderExecutionContext,
  sources: string[],
): Promise<string[]> {
  const resolved = await Promise.all(sources.map((source, index) =>
    resolveMedia(context, source, 'inline', `参考图 ${index + 1}`)));
  if (resolved.some((item) => !item)) {
    throw new ProviderError({
      providerId: 'agnes',
      code: 'configuration',
      message: 'Agnes 图片参考图解析失败，请使用有效图片 URL 或重新上传本地图片',
    });
  }
  return unique(resolved);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function assertReferenceLimit(model: string, kind: 'image' | 'video', sources: string[]): void {
  const capabilities = agnesModelCapabilities(model, kind);
  if (capabilities.maxReferenceImages !== null && sources.length > capabilities.maxReferenceImages) {
    throw new ProviderError({
      providerId: 'agnes',
      code: 'configuration',
      message: `Agnes 模型 ${model} 最多支持 ${capabilities.maxReferenceImages} 张参考图，当前为 ${sources.length} 张`,
    });
  }
}

function requireAgnesAspectRatio(
  model: string,
  kind: 'image' | 'video',
  requested: string | undefined,
): string {
  const capabilities = agnesModelCapabilities(model, kind);
  const aspectRatio = readString(requested) || capabilities.aspectRatios?.[0];
  if (!aspectRatio || !capabilities.aspectRatios?.includes(aspectRatio)) {
    throw new ProviderError({
      providerId: 'agnes',
      code: 'unsupported_capability',
      message: `Agnes 模型 ${model} 不支持画幅比例 ${aspectRatio || '空值'}，可用比例：${capabilities.aspectRatios?.join('、') || '未知'}`,
    });
  }
  return aspectRatio;
}

function invalid(message: string, details: unknown): ProviderError {
  return new ProviderError({ providerId: 'agnes', code: 'invalid_response', message, details });
}

export const agnesAdapter = createAgnesAdapter();
