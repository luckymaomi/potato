import type { AppConfig, SQLiteDatabase } from "../types/core";
import { NotFoundError, ValidationError } from "../errors";
import { MediaArchiveService } from "./mediaArchiveService";
import {
  FREEDUB_DEFAULT_BASE_URL,
  FREEDUB_DEFAULT_ROLE,
  FREEDUB_DEFAULT_STYLE,
  FreedubAdapter,
  type TtsAdapter,
} from "./ttsAdapter";

interface TtsStoredConfig {
  provider: string;
  base_url: string;
  api_key: string;
  role: string | null;
  style: string | null;
}

export class FreedubService {
  private readonly archive: MediaArchiveService;
  private readonly adapters = new Map<string, TtsAdapter>();

  constructor(
    private readonly db: SQLiteDatabase,
    config: AppConfig,
  ) {
    this.archive = new MediaArchiveService(config);
    this.register(new FreedubAdapter());
  }
  register(adapter: TtsAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  providers(): Array<{ id: string; label: string }> {
    return [...this.adapters.keys()].map((id) => ({
      id,
      label: id === "freedub" ? "PearAPI Freedub" : id,
    }));
  }

  async options(input?: {
    provider?: string;
    base_url?: string;
    api_key?: string;
  }): Promise<{ roles: string[]; styles: string[] }> {
    const stored = this.currentConfig();
    const config = {
      provider: input?.provider?.trim() || stored?.provider || "freedub",
      base_url:
        input?.base_url?.trim() || stored?.base_url || FREEDUB_DEFAULT_BASE_URL,
      api_key: input?.api_key?.trim() || stored?.api_key || "",
    };
    return this.adapter(config.provider).options({
      baseUrl: config.base_url,
      apiKey: config.api_key,
    });
  }

  async synthesize(input: {
    projectId: number;
    panelId: number;
    text: string;
    role?: string;
    style?: string;
  }): Promise<Record<string, unknown>> {
    if (
      !this.db
        .prepare(
          "SELECT p.id FROM panels p JOIN episodes e ON e.id = p.episode_id WHERE p.id = ? AND e.drama_id = ?",
        )
        .get(input.panelId, input.projectId)
    )
      throw new NotFoundError("分格不存在");
    const text = input.text.trim();
    if (!text) throw new ValidationError("配音文案不能为空");
    const config = this.currentConfig();
    if (!config) throw new ValidationError("尚未配置 TTS，无法进行配音");
    const result = await this.adapter(config.provider).synthesize(
      { baseUrl: config.base_url, apiKey: config.api_key },
      {
        text,
        role: input.role ?? config.role,
        style: input.style ?? config.style,
      },
    );
    const archived = await this.archive.archiveRemote({
      projectId: input.projectId,
      generationId: Date.now(),
      kind: "audio",
      sourceUrl: result.audioUrl,
    });
    const now = new Date().toISOString();
    const inserted = this.db
      .prepare(
        `INSERT INTO panel_audio (panel_id, role, style, text, source_url, local_path, public_url, media_type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
      )
      .run(
        input.panelId,
        input.role ?? config.role,
        input.style ?? config.style,
        text,
        result.audioUrl,
        archived.relativePath,
        archived.publicUrl,
        archived.mediaType,
        now,
        now,
      );
    return {
      id: Number(inserted.lastInsertRowid),
      panel_id: input.panelId,
      text,
      role: input.role ?? config.role,
      style: input.style ?? config.style,
      public_url: archived.publicUrl,
      local_path: archived.relativePath,
      status: "completed",
    };
  }

  latest(panelId: number): Record<string, unknown> | null {
    return (
      (this.db
        .prepare(
          "SELECT id, panel_id, text, role, style, public_url, local_path, status FROM panel_audio WHERE panel_id = ? ORDER BY id DESC LIMIT 1",
        )
        .get(panelId) as Record<string, unknown> | undefined) ?? null
    );
  }

  getConfig(): {
    provider: string;
    base_url: string;
    role: string | null;
    style: string | null;
    configured: boolean;
  } {
    const row = this.db
      .prepare(
        "SELECT provider, base_url, role, style FROM tts_configs WHERE id = 1",
      )
      .get() as Omit<TtsStoredConfig, "api_key"> | undefined;
    return row
      ? { ...row, configured: true }
      : {
          provider: "freedub",
          base_url: FREEDUB_DEFAULT_BASE_URL,
          role: FREEDUB_DEFAULT_ROLE,
          style: FREEDUB_DEFAULT_STYLE,
          configured: false,
        };
  }

  saveConfig(input: {
    provider: string;
    base_url: string;
    api_key: string;
    role?: string;
    style?: string;
  }): ReturnType<FreedubService["getConfig"]> {
    const provider = input.provider.trim();
    const baseUrl = input.base_url.trim();
    const existing = this.currentConfig();
    const apiKey = input.api_key.trim() || existing?.api_key || "";
    if (!provider || !baseUrl)
      throw new ValidationError("TTS 供应商与地址不能为空");
    if (!this.adapters.has(provider))
      throw new ValidationError(`未注册 TTS 适配器：${input.provider.trim()}`);
    this.db
      .prepare(
        "INSERT INTO tts_configs (id, provider, base_url, api_key, role, style, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, api_key = excluded.api_key, role = excluded.role, style = excluded.style, updated_at = excluded.updated_at",
      )
      .run(
        provider,
        baseUrl,
        apiKey,
        input.role ?? null,
        input.style ?? null,
        new Date().toISOString(),
      );
    return this.getConfig();
  }

  private currentConfig(): TtsStoredConfig | undefined {
    return this.db
      .prepare(
        "SELECT provider, base_url, api_key, role, style FROM tts_configs WHERE id = 1",
      )
      .get() as TtsStoredConfig | undefined;
  }
  private adapter(provider: string): TtsAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new ValidationError(`未注册 TTS 适配器：${provider}`);
    return adapter;
  }
}
