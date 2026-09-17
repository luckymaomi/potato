import type {
  ImageProviderRequest,
  ImageProviderResult,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderModel,
  ProviderModelDiscoveryInput,
  ProviderTaskStatus,
  TextProviderRequest,
  TextProviderResult,
  VideoProviderRequest,
  VideoProviderResult,
} from '../contracts';
import { ProviderError } from '../errors';
import { requestProviderJson, type ProviderFetch } from '../transport';

interface PearApiData {
  task_id?: unknown;
  status?: unknown;
  progress?: unknown;
  api_file_url?: unknown;
  image_urls?: unknown;
}

interface PearApiEnvelope {
  code?: unknown;
  msg?: unknown;
  detail?: unknown;
  data?: unknown;
}

export function createPearApiAdapter(fetchImpl: ProviderFetch = fetch): ProviderAdapter {
  return {
    descriptor: {
      id: 'pearapi',
      label: 'PearAPI',
      aliases: [],
      capabilities: {
        text: true,
        textToImage: true,
        imageToImage: true,
        textToVideo: true,
        imageToVideo: true,
        asynchronous: true,
        multipleImageReferences: true,
        firstLastFrame: false,
      },
      configuration: {
        defaultBaseUrl: 'https://api.pearapi.ai',
        endpoints: {
          text: { submit: '/v1/chat/completions' },
          image: { submit: '/api/image_generate', query: '/api/image_generate' },
          video: { submit: '/api/video_generate', query: '/api/video_generate' },
        },
      },
    },
    listModels: (input) => listModels(input, fetchImpl),
    generateText: (context, request) => generateText(context, request, fetchImpl),
    submitImage: (context, request) => submitImage(context, request, fetchImpl),
    pollImage: (context, taskId, signal) => pollImage(context, taskId, signal, fetchImpl),
    submitVideo: (context, request) => submitVideo(context, request, fetchImpl),
    pollVideo: (context, taskId, signal) => pollVideo(context, taskId, signal, fetchImpl),
  };
}

async function generateText(
  context: ProviderExecutionContext,
  request: TextProviderRequest,
  fetchImpl: ProviderFetch,
): Promise<TextProviderResult> {
  assertConfiguration(context);
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'pearapi',
    url: endpointUrl(context, 'text'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.config.api_key}`,
    },
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
  if (!text) throw invalidResponse(response.data, 'PearAPI 文本响应没有返回内容');
  return { status: 'completed', text };
}

async function listModels(
  input: ProviderModelDiscoveryInput,
  fetchImpl: ProviderFetch,
): Promise<ProviderModel[]> {
  const baseUrl = String(input.baseUrl || 'https://api.pearapi.ai').replace(/\/+$/u, '');
  const response = await requestProviderJson<Record<string, unknown>>({
    providerId: 'pearapi',
    url: `${baseUrl}/v1/models`,
    method: 'GET',
    headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : undefined,
    timeoutMs: 30_000,
    signal: input.signal,
  }, fetchImpl);
  const items = Array.isArray(response.data.data) ? response.data.data : [];
  const models = items
    .map((item) => normalizePearModel(item))
    .filter((model): model is ProviderModel => Boolean(model))
    .filter((model) => !input.serviceType || model.kind === input.serviceType);
  if (!models.length) throw invalidResponse(response.data, 'PearAPI 模型目录没有返回当前服务可用的模型');
  return models;
}

function normalizePearModel(value: unknown): ProviderModel | undefined {
  const item = asRecord(value);
  const id = readString(item?.id);
  const rawType = readString(item?.model_type)?.toLowerCase();
  const endpoints = Array.isArray(item?.supported_endpoint_types)
    ? item.supported_endpoint_types.map(readString).filter((entry): entry is string => Boolean(entry))
    : [];
  const kind = rawType === 'chat'
    ? 'text'
    : rawType === 'image'
      ? 'image'
      : rawType === 'video'
        ? 'video'
        : endpoints.some((endpoint) => /image/iu.test(endpoint))
          ? 'image'
          : endpoints.some((endpoint) => /video/iu.test(endpoint))
            ? 'video'
            : endpoints.some((endpoint) => /chat/iu.test(endpoint)) ? 'text' : undefined;
  if (!id || !kind) return undefined;
  return { id, label: readString(item?.model) || readString(item?.name) || id, kind };
}

async function submitImage(
  context: ProviderExecutionContext,
  request: ImageProviderRequest,
  fetchImpl: ProviderFetch,
): Promise<ImageProviderResult> {
  assertConfiguration(context);
  const taskType = readSetting(context.config.settings, 'task_type') === 'async' ? 'async' : 'sync';
  const envelope = await pearRequest(context, 'image', {
    key: context.config.api_key,
    prompt: required(request.prompt, '图片提示词'),
    model: required(request.model, '图片模型'),
    size: request.size || 'auto',
    task_type: taskType,
    ...(request.referenceImages.length ? { images: request.referenceImages.slice(0, 10) } : {}),
  }, request.signal, fetchImpl);
  return normalizeImage(envelope);
}

async function pollImage(
  context: ProviderExecutionContext,
  taskId: string,
  signal: AbortSignal | undefined,
  fetchImpl: ProviderFetch,
): Promise<ImageProviderResult> {
  const envelope = await pearRequest(context, 'image', {
    key: context.config.api_key,
    task_id: required(taskId, '图片任务 ID'),
  }, signal, fetchImpl);
  return normalizeImage(envelope, taskId);
}

async function submitVideo(
  context: ProviderExecutionContext,
  request: VideoProviderRequest,
  fetchImpl: ProviderFetch,
): Promise<VideoProviderResult> {
  assertConfiguration(context);
  const images = unique(await Promise.all([
    request.firstFrame,
    request.image,
    ...request.referenceImages,
  ].map((source, index) => resolveMedia(context, source, `reference_${index}`)))).slice(0, 10);
  const envelope = await pearRequest(context, 'video', {
    key: context.config.api_key,
    prompt: required(request.prompt, '视频提示词'),
    model: required(request.model, '视频模型'),
    aspect_ratio: request.aspectRatio || '16:9',
    images,
  }, request.signal, fetchImpl);
  return normalizeVideo(envelope);
}

async function pollVideo(
  context: ProviderExecutionContext,
  taskId: string,
  signal: AbortSignal | undefined,
  fetchImpl: ProviderFetch,
): Promise<VideoProviderResult> {
  const envelope = await pearRequest(context, 'video', {
    key: context.config.api_key,
    taskid: required(taskId, '视频任务 ID'),
  }, signal, fetchImpl);
  return normalizeVideo(envelope, taskId);
}

async function pearRequest(
  context: ProviderExecutionContext,
  kind: 'image' | 'video',
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  fetchImpl: ProviderFetch,
): Promise<PearApiEnvelope> {
  const response = await requestProviderJson<PearApiEnvelope>({
    providerId: 'pearapi',
    url: endpointUrl(context, kind),
    headers: { 'Content-Type': 'application/json' },
    body,
    timeoutMs: 120_000,
    signal,
  }, fetchImpl);
  if (response.data.code !== 200) {
    throw new ProviderError({
      providerId: 'pearapi',
      code: 'business_error',
      message: readString(response.data.detail) || readString(response.data.msg) || 'PearAPI 请求失败',
      details: response.data,
    });
  }
  return response.data;
}

function endpointUrl(context: ProviderExecutionContext, kind: 'text' | 'image' | 'video'): string {
  const base = String(context.config.base_url || 'https://api.pearapi.ai').replace(/\/+$/, '');
  const configured = String(context.config.endpoint || '').trim();
  const fallback = kind === 'text'
    ? '/v1/chat/completions'
    : kind === 'image' ? '/api/image_generate' : '/api/video_generate';
  const endpoint = configured || fallback;
  return /^https?:\/\//i.test(endpoint) ? endpoint : `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

function normalizeImage(envelope: PearApiEnvelope, expectedTaskId?: string): ImageProviderResult {
  const data = asRecord(envelope.data);
  const taskId = readString(data?.task_id) || expectedTaskId;
  const urls = Array.isArray(data?.image_urls) ? data.image_urls : [];
  const imageUrl = urls.map(readString).find(Boolean);
  const status = normalizeStatus(data?.status, imageUrl);
  if (status === 'failed') return compact({ status, taskId, error: providerMessage(envelope, 'PearAPI 图片生成失败') });
  if (imageUrl) return compact({ status: 'completed' as const, taskId, imageUrl });
  if (taskId) return compact({ status, taskId, progress: readProgress(data?.progress) });
  throw invalidResponse(envelope, 'PearAPI 未返回图片地址或任务 ID');
}

function normalizeVideo(envelope: PearApiEnvelope, expectedTaskId?: string): VideoProviderResult {
  const data = asRecord(envelope.data);
  const taskId = readString(data?.task_id) || expectedTaskId;
  const videoUrl = readString(data?.api_file_url);
  const status = normalizeStatus(data?.status, videoUrl);
  if (status === 'failed') return compact({ status, taskId, error: providerMessage(envelope, 'PearAPI 视频生成失败') });
  if (videoUrl) return compact({ status: 'completed' as const, taskId, videoUrl, progress: 100 });
  if (taskId) return compact({ status, taskId, progress: readProgress(data?.progress) });
  throw invalidResponse(envelope, 'PearAPI 未返回视频地址或任务 ID');
}

function normalizeStatus(value: unknown, mediaUrl?: string): ProviderTaskStatus {
  if (mediaUrl) return 'completed';
  const status = readString(value)?.toLowerCase();
  if (['completed', 'success', 'succeeded', 'done'].includes(status || '')) return 'completed';
  if (['failed', 'error', 'canceled', 'cancelled'].includes(status || '')) return 'failed';
  if (['running', 'processing', 'in_progress'].includes(status || '')) return 'running';
  return 'queued';
}

function assertConfiguration(context: ProviderExecutionContext): void {
  if (!String(context.config.api_key || '').trim()) {
    throw new ProviderError({ providerId: 'pearapi', code: 'configuration', message: 'PearAPI API Key 未配置' });
  }
}

function required(value: unknown, label: string): string {
  const text = readString(value);
  if (text) return text;
  throw new ProviderError({ providerId: 'pearapi', code: 'configuration', message: `${label}不能为空` });
}

function invalidResponse(details: unknown, message: string): ProviderError {
  return new ProviderError({ providerId: 'pearapi', code: 'invalid_response', message, details });
}

function providerMessage(envelope: PearApiEnvelope, fallback: string): string {
  return readString(envelope.detail) || readString(envelope.msg) || fallback;
}

function readSetting(settings: unknown, key: string): unknown {
  return asRecord(settings)?.[key];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readProgress(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(readString).filter((value): value is string => Boolean(value)))];
}

async function resolveMedia(
  context: ProviderExecutionContext,
  source: string | undefined,
  label: string,
): Promise<string | undefined> {
  if (!source) return undefined;
  return context.resolveMediaReference
    ? context.resolveMediaReference(source, { label })
    : source;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

export const pearApiAdapter = createPearApiAdapter();
