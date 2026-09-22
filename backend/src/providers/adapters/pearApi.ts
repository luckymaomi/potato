import type {
  ImageProviderRequest, ImageProviderResult, ProviderAdapter, ProviderExecutionContext,
  ProviderModel, ProviderModelCapabilities, ProviderModelDiscoveryInput, ProviderTaskStatus,
  VideoProviderRequest, VideoProviderResult,
} from '../contracts';
import { modelCapabilities } from '../modelCapabilities';
import { ProviderError } from '../errors';
import { requestProviderJson, type ProviderFetch } from '../transport';

type JsonRecord = Record<string, unknown>;
interface PearModelMetadata { model_id?: unknown; model_name?: unknown; model_type?: unknown; channel_type?: unknown; reference_image?: unknown; aspect_ratio?: unknown; supported_modes?: unknown; duration_mode?: unknown; duration_type?: unknown; billing_type?: unknown; charge_type?: unknown; pricing_type?: unknown; supported_durations?: unknown; durations?: unknown }

/** PearAPI 官方 /v1 协议适配器；旧 /api/*、generation_key 与兼容视频字段均不再使用。 */
export function createPearApiAdapter(fetchImpl: ProviderFetch = fetch): ProviderAdapter {
  return {
    descriptor: { id: 'pearapi', label: 'PearAPI', aliases: [], capabilities: { textToImage: true, imageToImage: true, textToVideo: true, imageToVideo: true, asynchronous: true, multipleImageReferences: true, firstLastFrame: false }, configuration: { defaultBaseUrl: 'https://api.pearapi.ai', endpoints: { image: { submit: '/v1/images/generations', query: '/v1/images/tasks' }, video: { submit: '/v1/video/generations', query: '/v1/video/generations' } } } },
    listModels: (input) => listModels(input, fetchImpl),
    submitImage: (context, request) => submitImage(context, request, fetchImpl),
    pollImage: (context, taskId, signal) => pollImage(context, taskId, signal, fetchImpl),
    submitVideo: (context, request) => submitVideo(context, request, fetchImpl),
    pollVideo: (context, taskId, signal) => pollVideo(context, taskId, signal, fetchImpl),
  };
}

async function listModels(input: ProviderModelDiscoveryInput, fetchImpl: ProviderFetch): Promise<ProviderModel[]> {
  const response = await requestProviderJson<JsonRecord>({ providerId: 'pearapi', url: `${normalizeBaseUrl(input.baseUrl)}/v1/models`, method: 'GET', headers: { Authorization: `Bearer ${required(input.apiKey, 'PearAPI API Key')}` }, signal: input.signal }, fetchImpl);
  const items = Array.isArray(response.data.data) ? response.data.data : [];
  const models = items.map(normalizePearModel).filter((model): model is ProviderModel => Boolean(model)).filter((model) => !input.serviceType || model.kind === input.serviceType);
  if (!models.length) throw invalidResponse(response.data, 'PearAPI 模型目录没有返回可用模型');
  return models;
}

function normalizePearModel(value: unknown): ProviderModel | undefined {
  const item = asRecord(value); const id = readString(item?.id); const endpoints = arrayStrings(item?.supported_endpoint_types); const rawType = readString(item?.model_type)?.toLowerCase();
  if (!id) return undefined;
  const kind = rawType === 'image'
    ? 'image'
    : rawType === 'video'
      ? 'video'
      : rawType
        ? undefined
        : endpoints.some((entry) => /image/iu.test(entry))
          ? 'image'
          : endpoints.some((entry) => /video/iu.test(entry))
            ? 'video'
            : endpoints.length ? undefined : inferModelKind(id);
  if (!kind) return undefined;
  const known = isKnownModelOverride(id);
  return {
    id,
    label: readString(item?.model) || readString(item?.name) || id,
    kind,
    capabilities: pearModelCapabilities(id, kind, endpoints, knownModelMetadata(id, item || {}), known ? 'adapter-override' : 'provider'),
  };
}

function inferModelKind(id: string): 'image' | 'video' | undefined {
  if (/grok.*video|veo|sora|video|seedance|ltx/iu.test(id)) return 'video';
  if (/flux|image|seedream|nano.?banana|sdxl|stable.?diffusion/iu.test(id)) return 'image';
  return undefined;
}

function knownModelMetadata(id: string, item: JsonRecord): PearModelMetadata {
  const metadata = asRecord(item.capabilities) as PearModelMetadata | undefined; const lower = id.toLowerCase();
  // /v1/models 返回的正式 id（含 2.5、2-2k 等清晰度档）按同族能力补洞；静态专栏可能滞后。
  if (isGptImage2FamilyId(lower)) return {
    ...metadata,
    supported_modes: ['text2image', 'image2image'],
    reference_image: 16,
    aspect_ratio: ['9:16', '16:9', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '2:1', '1:2', '21:9', '9:21'],
  };
  if (lower === 'gpt-image-1.5') return {
    ...metadata,
    supported_modes: ['text2image', 'image2image'],
    reference_image: 16,
    aspect_ratio: ['9:16', '16:9', '1:1'],
  };
  if (isNanoBananaFamilyId(lower)) return {
    ...metadata,
    supported_modes: ['text2image', 'image2image'],
    reference_image: lower === 'nano-banana' ? 6 : 14,
    aspect_ratio: lower === 'nano-banana'
      ? ['9:16', '16:9', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '21:9']
      : ['9:16', '16:9', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '21:9', '1:4', '4:1', '1:8', '8:1'],
  };
  if (isGrokImagineImageId(lower)) return {
    ...metadata,
    supported_modes: ['text2image', 'image2image'],
    reference_image: 4,
    aspect_ratio: [
      '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2',
      '19.5:9', '9:19.5', '20:9', '9:20',
    ],
  };
  if (/^grok-imagine-video-1\.5(?:-preview)?$/iu.test(lower)) return { ...metadata, supported_modes: ['text2video', 'image2video'], reference_image: 1, aspect_ratio: ['16:9', '9:16'], supported_durations: [4, 6, 8, 10, 12, 15], billing_type: metadata?.billing_type || 'per-request' };
  return metadata || {};
}

function isKnownModelOverride(id: string): boolean {
  const lower = id.toLowerCase();
  return isGptImage2FamilyId(lower)
    || lower === 'gpt-image-1.5'
    || isNanoBananaFamilyId(lower)
    || isGrokImagineImageId(lower)
    || /^grok-imagine-video-1\.5(?:-preview)?$/iu.test(lower);
}

/** gpt-image-2 / gpt-image-2.5 及目录清晰度档 -1k/-2k/-4k */
function isGptImage2FamilyId(lower: string): boolean {
  return /^gpt-image-2(?:\.\d+)?(?:-(?:1k|2k|4k))?$/iu.test(lower);
}

/** nano-banana 基础 / pro / 2 及目录清晰度档 -1k/-2k/-4k、lite */
function isNanoBananaFamilyId(lower: string): boolean {
  return /^nano-banana(?:-pro(?:-(?:1k|2k|4k))?|-2(?:-(?:1k|2k|4k|lite))?)?$/iu.test(lower);
}

/** grok-imagine-image 及目录正式变体 -2、-2-2k；兼容旧别名 grok-3/4-image */
function isGrokImagineImageId(lower: string): boolean {
  return /^grok-imagine-image(?:-\d+(?:\.\d+)?)?(?:-(?:1k|2k|4k))?$/iu.test(lower)
    || lower === 'grok-3-image'
    || lower === 'grok-4-image';
}

function pearModelCapabilities(
  modelId: string,
  kind: 'image' | 'video',
  endpoints: string[],
  metadata: PearModelMetadata,
  source: 'provider' | 'adapter-override' = 'provider',
): ProviderModelCapabilities {
  if (kind === 'image') {
    const supportedModes = arrayStrings(metadata.supported_modes);
    const modes = [...(endpoints.some((e) => /images\.generations|text2image/iu.test(e)) || supportedModes.some((mode) => /text2image|text-to-image/iu.test(mode)) ? ['text-to-image' as const] : []), ...(endpoints.some((e) => /images\.edits|image2image/iu.test(e)) || supportedModes.some((mode) => /image2image|image-to-image/iu.test(mode)) ? ['image-to-image' as const] : [])];
    return modelCapabilities(modes, readNonNegativeInteger(metadata.reference_image) ?? (modes.includes('image-to-image') ? null : 0), pearAspectRatios(metadata.aspect_ratio), source);
  }
  const supportedModes = arrayStrings(metadata.supported_modes); const modes = [...(supportedModes.some((m) => /text2video|text-to-video/iu.test(m)) ? ['text-to-video' as const] : []), ...(supportedModes.some((m) => /image2video|imageend2video|reference2video|image-to-video/iu.test(m)) ? ['image-to-video' as const] : [])];
  const durations = readDurations(metadata.supported_durations ?? metadata.durations);
  return modelCapabilities(modes.length ? modes : ['text-to-video', 'image-to-video'], readNonNegativeInteger(metadata.reference_image), pearAspectRatios(metadata.aspect_ratio), source, billingMode(modelId, metadata), durations);
}

async function submitImage(context: ProviderExecutionContext, request: ImageProviderRequest, fetchImpl: ProviderFetch): Promise<ImageProviderResult> {
  const references = await resolveImageReferences(context, request.referenceImages); const body: JsonRecord = { model: required(request.model, '图片模型'), prompt: required(request.prompt, '图片提示词'), ...(request.aspectRatio || request.size ? { aspect_ratio: request.aspectRatio || request.size } : {}), ...(request.size ? { size: request.size } : {}), response_format: 'url', task_type: 'async', ...(request.quality ? { quality: request.quality } : {}), ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}), ...(references.length === 1 ? { image: references[0] } : references.length > 1 ? { images: references } : {}) };
  const response = await pearRequest(context, 'image', 'submit', body, request.signal, fetchImpl); return normalizeImage(response.data);
}
async function pollImage(context: ProviderExecutionContext, taskId: string, signal: AbortSignal | undefined, fetchImpl: ProviderFetch): Promise<ImageProviderResult> { const response = await pearRequest(context, 'image', 'query', undefined, signal, fetchImpl, taskId); return normalizeImage(response.data, taskId); }
async function submitVideo(context: ProviderExecutionContext, request: VideoProviderRequest, fetchImpl: ProviderFetch): Promise<VideoProviderResult> {
  const sources = unique([request.firstFrame, request.image, ...request.referenceImages]); const references = (await Promise.all(sources.map((source, index) => resolveMedia(context, source, 'public-url', `reference_${index + 1}`)))).filter((value): value is string => Boolean(value));
  // Grok Imagine Video 1.5 的专栏合同使用 seconds + images；不再发送通用 schema
  // 中标记为旧版/兼容字段的 duration、reference_contents。
  const body: JsonRecord = { model: required(request.model, '视频模型'), prompt: required(request.prompt, '视频提示词'), mode: references.length ? 'image2video' : 'text2video', ...(request.duration === undefined ? {} : { seconds: request.duration }), ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}), ...(references.length ? { images: references } : {}) };
  const response = await pearRequest(context, 'video', 'submit', body, request.signal, fetchImpl); return normalizeVideo(response.data);
}
async function pollVideo(context: ProviderExecutionContext, taskId: string, signal: AbortSignal | undefined, fetchImpl: ProviderFetch): Promise<VideoProviderResult> { const response = await pearRequest(context, 'video', 'query', undefined, signal, fetchImpl, taskId); return normalizeVideo(response.data, taskId); }

async function pearRequest(context: ProviderExecutionContext, kind: 'image' | 'video', operation: 'submit' | 'query', body: JsonRecord | undefined, signal: AbortSignal | undefined, fetchImpl: ProviderFetch, taskId?: string) {
  const response = await requestProviderJson<unknown>({ providerId: 'pearapi', url: endpointUrl(context, kind, operation, taskId), method: operation === 'query' ? 'GET' : 'POST', headers: authHeaders(context), body, signal, retryNetworkErrors: operation === 'query' }, fetchImpl);
  const data = asRecord(response.data); if (data?.error) throw providerErrorFromPayload(data, response.status); return response;
}

function normalizeImage(payload: unknown, expectedTaskId?: string): ImageProviderResult {
  const root = asRecord(payload); const output = asRecord(root?.output); const nestedData = asRecord(root?.data); const taskId = readString(root?.id) || readString(root?.task_id) || readString(nestedData?.id) || expectedTaskId; const status = normalizeStatus(root?.status || nestedData?.status);
  const urls = [...(Array.isArray(output?.image_urls) ? output.image_urls : []), ...(Array.isArray(nestedData?.image_urls) ? nestedData.image_urls : []), ...(Array.isArray(output?.data) ? output.data.map((entry) => asRecord(entry)?.url) : []), ...(Array.isArray(root?.data) ? root.data.map((entry) => asRecord(entry)?.url) : [])].map(readString).filter((url): url is string => Boolean(url));
  if (status === 'failed') return compact({ status, taskId, error: payloadError(root, 'PearAPI 图片生成失败') }); if (urls[0]) return compact({ status: 'completed' as const, taskId, imageUrl: urls[0], progress: readProgress(root?.progress) }); if (taskId) return compact({ status, taskId, progress: readProgress(root?.progress) }); throw invalidResponse(payload, 'PearAPI 未返回图片地址或任务 ID');
}
function normalizeVideo(payload: unknown, expectedTaskId?: string): VideoProviderResult {
  const root = asRecord(payload); const taskId = readString(root?.task_id) || readString(root?.id) || expectedTaskId; const videoUrl = readString(root?.url) || readString(asRecord(root?.output)?.video_url); const status = normalizeStatus(root?.status); if (status === 'failed') return compact({ status, taskId, error: payloadError(root, 'PearAPI 视频生成失败') }); if (videoUrl) return compact({ status: 'completed' as const, taskId, videoUrl, progress: 100 }); if (taskId) return compact({ status, taskId, progress: readProgress(root?.progress) }); throw invalidResponse(payload, 'PearAPI 未返回视频地址或任务 ID');
}
function normalizeStatus(value: unknown): ProviderTaskStatus { const status = readString(value)?.toLowerCase(); if (['completed', 'success', 'succeeded', 'done'].includes(status || '')) return 'completed'; if (['failed', 'error', 'canceled', 'cancelled'].includes(status || '')) return 'failed'; if (['running', 'processing', 'in_progress'].includes(status || '')) return 'running'; return 'queued'; }
function endpointUrl(context: ProviderExecutionContext, kind: 'image' | 'video', operation: 'submit' | 'query', taskId?: string): string { const base = normalizeBaseUrl(context.config.base_url); const endpoint = kind === 'image' ? (operation === 'query' ? '/v1/images/tasks' : '/v1/images/generations') : '/v1/video/generations'; const url = absoluteEndpoint(base, endpoint); return operation === 'query' && taskId ? `${url.replace(/\/+$/u, '')}/${encodeURIComponent(taskId)}` : url; }
function normalizeBaseUrl(value: string | undefined): string { return String(value || 'https://api.pearapi.ai').replace(/\/+$/u, '').replace(/\/v1$/iu, ''); }
function absoluteEndpoint(base: string, endpoint: string): string { return /^https?:\/\//iu.test(endpoint) ? endpoint : `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`; }
function authHeaders(context: ProviderExecutionContext): Record<string, string> { return { 'Content-Type': 'application/json', Authorization: `Bearer ${required(context.config.api_key, 'PearAPI API Key')}` }; }
function providerErrorFromPayload(payload: JsonRecord, httpStatus?: number): ProviderError { const error = asRecord(payload.error); return new ProviderError({ providerId: 'pearapi', code: 'business_error', message: readString(error?.message) || readString(payload.message) || 'PearAPI 请求失败', httpStatus, details: payload }); }
function payloadError(payload: JsonRecord | undefined, fallback: string): string { const error = asRecord(payload?.error); return readString(error?.message) || readString(payload?.message) || fallback; }
function invalidResponse(details: unknown, message: string): ProviderError { return new ProviderError({ providerId: 'pearapi', code: 'invalid_response', message, details }); }
function required(value: unknown, label: string): string { const text = readString(value); if (text) return text; throw new ProviderError({ providerId: 'pearapi', code: 'configuration', message: `${label}不能为空` }); }
function asRecord(value: unknown): JsonRecord | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined; }
function readString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function readProgress(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function readNonNegativeInteger(value: unknown): number | null { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; }
function readDurations(value: unknown): number[] | null { if (!Array.isArray(value)) return null; const durations = [...new Set(value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0))].map((entry) => Math.round(entry)).sort((a, b) => a - b); return durations.length ? durations : null; }
function arrayStrings(value: unknown): string[] { return Array.isArray(value) ? value.map(readString).filter((entry): entry is string => Boolean(entry)) : []; }
function pearAspectRatios(value: unknown): string[] | null { const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、\s]+/u) : []; const ratios = entries.map(readString).filter((entry): entry is string => Boolean(entry)).map((entry) => entry.replace(/：/gu, ':')).filter((entry) => /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/u.test(entry)); return ratios.length ? [...new Set(ratios)] : null; }
function billingMode(modelId: string, metadata: PearModelMetadata): 'duration' | 'per-request' | 'unknown' { const explicit = [metadata.duration_mode, metadata.duration_type, metadata.billing_type, metadata.charge_type, metadata.pricing_type].map(readString).find(Boolean); if (explicit) { const normalized = explicit.toLowerCase().replace(/[ _-]/gu, ''); if (/duration|second|时长/iu.test(explicit) || ['duration', 'persecond', 'byduration'].includes(normalized)) return 'duration'; if (/request|call|次/iu.test(explicit) || ['request', 'perrequest', 'percall', 'peruse', 'byrequest'].includes(normalized)) return 'per-request'; } if (readDurations(metadata.supported_durations ?? metadata.durations)) return 'duration'; if (/^grok-imagine-video-1\.5(?:-preview)?$/iu.test(modelId)) return 'per-request'; return 'unknown'; }
async function resolveMedia(context: ProviderExecutionContext, source: string, format: 'inline' | 'public-url', label: string): Promise<string | undefined> { return context.resolveMediaReference ? context.resolveMediaReference(source, { format, label }) : source; }
async function resolveImageReferences(context: ProviderExecutionContext, sources: string[]): Promise<string[]> { const values = await Promise.all(sources.map((source, index) => resolveMedia(context, source, 'inline', `参考图 ${index + 1}`))); if (values.some((value) => !value)) throw new ProviderError({ providerId: 'pearapi', code: 'configuration', message: 'PearAPI 参考图解析失败' }); return unique(values); }
function unique(values: Array<string | undefined>): string[] { return [...new Set(values.map(readString).filter((value): value is string => Boolean(value)))]; }
function compact<T extends JsonRecord>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T; }
export const pearApiAdapter = createPearApiAdapter();
