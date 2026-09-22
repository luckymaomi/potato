import { ValidationError } from "../errors";

export const FREEDUB_DEFAULT_BASE_URL = "https://api.pearapi.ai/api/freedub";
export const FREEDUB_DEFAULT_ROLE = "zh-CN-XiaoyiNeural";
export const FREEDUB_DEFAULT_STYLE = "cheerful";

export interface TtsAdapterConfig {
  baseUrl: string;
  apiKey: string;
}
export interface TtsSynthesisRequest {
  text: string;
  role?: string | null;
  style?: string | null;
}
export interface TtsSynthesisResult {
  audioUrl: string;
}
export interface TtsAdapter {
  readonly provider: string;
  options(
    config: TtsAdapterConfig,
  ): Promise<{ roles: string[]; styles: string[] }>;
  synthesize(
    config: TtsAdapterConfig,
    input: TtsSynthesisRequest,
  ): Promise<TtsSynthesisResult>;
}

export class FreedubAdapter implements TtsAdapter {
  readonly provider = "freedub";

  async options(
    config: TtsAdapterConfig,
  ): Promise<{ roles: string[]; styles: string[] }> {
    const response = await fetch(this.endpoint(config), {
      headers: this.headers(config),
    });
    if (!response.ok)
      throw new ValidationError(
        `freedub 目录请求失败：HTTP ${response.status}`,
      );
    const body = (await response.json()) as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : body;
    return { roles: strings(data.roles), styles: strings(data.styles) };
  }

  async synthesize(
    config: TtsAdapterConfig,
    input: TtsSynthesisRequest,
  ): Promise<TtsSynthesisResult> {
    const response = await fetch(this.endpoint(config), {
      method: "POST",
      headers: { ...this.headers(config), "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        role: input.role ?? undefined,
        style: input.style ?? undefined,
      }),
    });
    if (!response.ok)
      throw new ValidationError(`freedub 请求失败：HTTP ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : body;
    const audioUrl =
      typeof data.audio_url === "string"
        ? data.audio_url
        : typeof data.url === "string"
          ? data.url
          : undefined;
    if (!audioUrl) throw new ValidationError("freedub 未返回 audio_url");
    return { audioUrl };
  }

  private endpoint(config: TtsAdapterConfig): string {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/u, "");
    return baseUrl.endsWith("/api/freedub")
      ? baseUrl
      : `${baseUrl}/api/freedub`;
  }
  private headers(config: TtsAdapterConfig): Record<string, string> {
    return config.apiKey.trim()
      ? { Authorization: `Bearer ${config.apiKey}` }
      : {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
