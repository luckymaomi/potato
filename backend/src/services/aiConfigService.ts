import {
  modelSupportsAspectRatio,
  modelSupportsMode,
  parseModelCapabilities,
  type ProviderAdapter,
  type ProviderDescriptor,
  type ProviderKind,
  type ProviderModel,
  type ProviderModelMode,
  type ProviderRegistry,
} from '../providers';
import type { AiModelPreset, AiModelPresets, AiServiceConfig, AiServiceType, ProviderCatalogStatus, ProviderModelSnapshot } from '../types/ai';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { readString } from '../types/core';
import { ValidationError } from '../errors';

interface CatalogRow {
  provider: string;
  model_id: string;
  label: string;
  kind: ProviderKind;
  capabilities: string;
  synchronized_at: string;
}

interface PresetRow {
  service_type: AiServiceType;
  provider: string;
  model_id: string;
}

interface ModelSelectionRequirements {
  mode?: ProviderModelMode;
  referenceImageCount?: number;
  aspectRatio?: string;
  requiresAspectRatio?: boolean;
}

export class AiConfigService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly registry: ProviderRegistry,
    private readonly appConfig: AppConfig,
    private readonly log?: Logger,
  ) {}

  providers(): ProviderCatalogStatus[] {
    return this.registry.list().map((descriptor) => {
      const runtime = this.providerConfig(descriptor.id);
      const rows = this.catalogRows(descriptor.id);
      return {
        id: descriptor.id,
        label: descriptor.label,
        aliases: descriptor.aliases,
        capabilities: descriptor.capabilities,
        enabled: runtime?.enabled !== false,
        configured: Boolean(readString(runtime?.api_key)),
        model_counts: {
          text: rows.filter((row) => row.kind === 'text').length,
          image: rows.filter((row) => row.kind === 'image').length,
          video: rows.filter((row) => row.kind === 'video').length,
        },
        synchronized_at: rows.map((row) => row.synchronized_at).sort().at(-1) ?? null,
      };
    });
  }

  models(provider?: string, serviceType?: AiServiceType): ProviderModelSnapshot[] {
    const providerId = provider ? this.requireAdapter(provider).descriptor.id : undefined;
    return this.catalogRows(providerId, serviceType).map((row) => ({
      provider: row.provider,
      id: row.model_id,
      label: row.label,
      kind: row.kind,
      capabilities: parseModelCapabilities(row.capabilities),
      synchronized_at: row.synchronized_at,
    }));
  }

  presets(): AiModelPresets {
    const presets: AiModelPresets = { text: null, image: null, video: null };
    const rows = this.db.prepare(`
      SELECT service_type, provider, model_id
      FROM ai_model_presets
      ORDER BY service_type
    `).all() as PresetRow[];
    for (const row of rows) presets[row.service_type] = { provider: row.provider, model: row.model_id };
    return presets;
  }

  savePresets(presets: AiModelPresets): AiModelPresets {
    const normalized: AiModelPresets = {
      text: this.validatePreset('text', presets.text),
      image: this.validatePreset('image', presets.image),
      video: this.validatePreset('video', presets.video),
    };
    const save = this.db.transaction(() => {
      this.db.prepare('DELETE FROM ai_model_presets').run();
      const insert = this.db.prepare(`
        INSERT INTO ai_model_presets (service_type, provider, model_id, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const serviceType of serviceTypes) {
        const preset = normalized[serviceType];
        if (preset) insert.run(serviceType, preset.provider, preset.model, now);
      }
    });
    save();
    this.log?.audit?.('ai.model-presets.updated', { presets: normalized });
    return this.presets();
  }

  async refresh(provider: string, serviceType?: AiServiceType): Promise<ProviderModelSnapshot[]> {
    const adapter = this.requireAdapter(provider);
    if (!adapter.listModels) throw new ValidationError(`${adapter.descriptor.label} 未实现动态模型目录`);
    if (serviceType) assertCapability(adapter.descriptor, serviceType);
    const runtime = this.requireProviderConfig(adapter.descriptor.id);
    if (runtime.enabled === false) throw new ValidationError(`${adapter.descriptor.label} 已在 config.yaml 中停用`);
    const models = await adapter.listModels({
      apiKey: readString(runtime.api_key) ?? '',
      baseUrl: readString(runtime.base_url) ?? adapter.descriptor.configuration?.defaultBaseUrl,
      serviceType,
    });
    const synchronizedAt = new Date().toISOString();
    this.replaceCatalog(adapter.descriptor.id, models, synchronizedAt, serviceType);
    return this.models(adapter.descriptor.id, serviceType);
  }

  select(
    serviceType: AiServiceType,
    provider?: string,
    model?: string,
    requirements: ModelSelectionRequirements = {},
  ): AiServiceConfig {
    const requestedProvider = provider ? this.requireAdapter(provider).descriptor.id : undefined;
    const preset = model ? null : this.presets()[serviceType];
    const applicablePreset = preset && (!requestedProvider || preset.provider === requestedProvider) ? preset : null;
    const descriptors = this.registry.list(serviceType)
      .filter((descriptor) => !requestedProvider || descriptor.id === requestedProvider)
      .filter((descriptor) => {
        const runtime = this.providerConfig(descriptor.id);
        return runtime?.enabled !== false && Boolean(readString(runtime?.api_key));
      });

    if (model) {
      for (const descriptor of descriptors) {
        const available = this.models(descriptor.id, serviceType);
        const selectedModel = available.find((entry) => entry.id === model);
        if (!selectedModel) continue;
        this.assertRequirements(selectedModel, requirements);
        return this.executionConfig(descriptor, serviceType, available, selectedModel.id);
      }
      throw new ValidationError(`动态模型目录中没有可用的 ${model}`);
    }

    if (applicablePreset) {
      const descriptor = descriptors.find((entry) => entry.id === applicablePreset.provider);
      if (!descriptor) {
        throw new ValidationError(`界面预设的${serviceLabel(serviceType)}供应商当前不可用：${applicablePreset.provider}`);
      }
      const available = this.models(descriptor.id, serviceType);
      const selectedModel = available.find((entry) => entry.id === applicablePreset.model);
      if (!selectedModel) {
        throw new ValidationError(`界面预设的${serviceLabel(serviceType)}模型不在实时目录：${applicablePreset.model}`);
      }
      this.assertRequirements(selectedModel, requirements);
      return this.executionConfig(descriptor, serviceType, available, selectedModel.id);
    }

    let automatic: {
      descriptor: ProviderDescriptor;
      available: ProviderModelSnapshot[];
      model: ProviderModelSnapshot;
      confidence: number;
    } | undefined;
    for (const descriptor of descriptors) {
      const available = this.models(descriptor.id, serviceType);
      for (const candidate of available) {
        if (!this.matchesRequirements(candidate, requirements)) continue;
        const confidence = this.requirementConfidence(candidate, requirements);
        if (!automatic || confidence > automatic.confidence) {
          automatic = { descriptor, available, model: candidate, confidence };
        }
      }
    }
    if (automatic) {
      return this.executionConfig(automatic.descriptor, serviceType, automatic.available, automatic.model.id);
    }

    if (requirements.aspectRatio) throw new ValidationError(`动态模型目录中没有支持画幅比例 ${requirements.aspectRatio} 的模型`);
    if (requirements.requiresAspectRatio) throw new ValidationError(`动态模型目录中没有可接受画幅比例参数的${serviceLabel(serviceType)}模型`);
    if (requirements.mode) throw new ValidationError(`动态模型目录中没有支持${modeLabel(requirements.mode)}的模型`);
    throw new ValidationError(`尚未同步可用的${serviceLabel(serviceType)}模型，请先打开 AI 配置刷新模型目录`);
  }

  resolveAspectRatio(
    serviceType: Extract<AiServiceType, 'image' | 'video'>,
    provider: string,
    modelId: string,
    requested?: string,
  ): string {
    const model = this.models(provider, serviceType).find((entry) => entry.id === modelId);
    if (!model) throw new ValidationError(`动态模型目录中没有可用的 ${modelId}`);
    const aspectRatio = readString(requested) ?? model.capabilities.aspectRatios?.[0];
    if (!aspectRatio) {
      throw new ValidationError(`没有为模型 ${model.label} 提供画幅比例，模型目录也没有可用默认值`);
    }
    this.assertRequirements(model, { aspectRatio });
    return aspectRatio;
  }

  private executionConfig(
    descriptor: ProviderDescriptor,
    serviceType: AiServiceType,
    models: ProviderModelSnapshot[],
    defaultModel: string,
  ): AiServiceConfig {
    const runtime = this.requireProviderConfig(descriptor.id);
    const endpoints = descriptor.configuration?.endpoints?.[serviceType];
    return {
      id: 0,
      service_type: serviceType,
      provider: descriptor.id,
      name: descriptor.label,
      base_url: readString(runtime.base_url) ?? descriptor.configuration?.defaultBaseUrl ?? '',
      api_key: readString(runtime.api_key) ?? '',
      model: models.map((entry) => entry.id),
      default_model: defaultModel,
      endpoint: endpoints?.submit ?? '',
      query_endpoint: endpoints?.query ?? '',
      priority: 0,
      is_default: true,
      is_active: runtime.enabled !== false,
      settings: runtime.settings ?? null,
    };
  }

  private replaceCatalog(
    provider: string,
    models: ProviderModel[],
    synchronizedAt: string,
    serviceType?: AiServiceType,
  ): void {
    const replace = this.db.transaction(() => {
      if (serviceType) {
        this.db.prepare('DELETE FROM provider_model_catalog WHERE provider = ? AND kind = ?').run(provider, serviceType);
      } else {
        this.db.prepare('DELETE FROM provider_model_catalog WHERE provider = ?').run(provider);
      }
      const insert = this.db.prepare(`
        INSERT INTO provider_model_catalog (provider, model_id, label, kind, capabilities, synchronized_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const model of models) {
        insert.run(provider, model.id, model.label, model.kind, JSON.stringify(model.capabilities), synchronizedAt);
      }
    });
    replace();
  }

  private catalogRows(provider?: string, serviceType?: AiServiceType): CatalogRow[] {
    if (provider && serviceType) {
      return this.db.prepare(`
        SELECT * FROM provider_model_catalog WHERE provider = ? AND kind = ? ORDER BY label, model_id
      `).all(provider, serviceType) as CatalogRow[];
    }
    if (provider) {
      return this.db.prepare('SELECT * FROM provider_model_catalog WHERE provider = ? ORDER BY kind, label, model_id')
        .all(provider) as CatalogRow[];
    }
    if (serviceType) {
      return this.db.prepare('SELECT * FROM provider_model_catalog WHERE kind = ? ORDER BY provider, label, model_id')
        .all(serviceType) as CatalogRow[];
    }
    return this.db.prepare('SELECT * FROM provider_model_catalog ORDER BY provider, kind, label, model_id').all() as CatalogRow[];
  }

  private requireAdapter(provider: string): ProviderAdapter {
    const adapter = this.registry.get(provider);
    if (!adapter) throw new ValidationError(`供应商未注册：${provider}`);
    return adapter;
  }

  private assertRequirements(model: ProviderModelSnapshot, requirements: ModelSelectionRequirements): void {
    if (requirements.mode && model.capabilities.modes.length > 0
      && !modelSupportsMode(model.capabilities, requirements.mode)) {
      throw new ValidationError(`模型 ${model.label} 不支持${modeLabel(requirements.mode)}`);
    }
    const referenceCount = Math.max(0, requirements.referenceImageCount ?? 0);
    if (model.capabilities.maxReferenceImages !== null && referenceCount > model.capabilities.maxReferenceImages) {
      throw new ValidationError(`模型 ${model.label} 最多支持 ${model.capabilities.maxReferenceImages} 张参考图，当前为 ${referenceCount} 张`);
    }
    if (requirements.requiresAspectRatio
      && model.capabilities.aspectRatios !== null
      && model.capabilities.aspectRatios.length === 0) {
      throw new ValidationError(`模型 ${model.label} 明确不支持画幅比例参数`);
    }
    const aspectRatio = readString(requirements.aspectRatio);
    if (aspectRatio && !modelSupportsAspectRatio(model.capabilities, aspectRatio)) {
      throw new ValidationError(`模型 ${model.label} 不支持画幅比例 ${aspectRatio}，可用比例：${model.capabilities.aspectRatios?.join('、') || '未知'}`);
    }
  }

  private matchesRequirements(model: ProviderModelSnapshot, requirements: ModelSelectionRequirements): boolean {
    if (requirements.mode && model.capabilities.modes.length > 0
      && !modelSupportsMode(model.capabilities, requirements.mode)) return false;
    const referenceCount = Math.max(0, requirements.referenceImageCount ?? 0);
    if (model.capabilities.maxReferenceImages !== null
      && referenceCount > model.capabilities.maxReferenceImages) return false;
    if (requirements.requiresAspectRatio
      && model.capabilities.aspectRatios !== null
      && model.capabilities.aspectRatios.length === 0) return false;
    const aspectRatio = readString(requirements.aspectRatio);
    if (aspectRatio && !modelSupportsAspectRatio(model.capabilities, aspectRatio)) return false;
    return true;
  }

  private requirementConfidence(model: ProviderModelSnapshot, requirements: ModelSelectionRequirements): number {
    let confidence = 0;
    if (requirements.mode && model.capabilities.modes.length > 0) confidence += 1;
    if ((requirements.referenceImageCount ?? 0) > 0 && model.capabilities.maxReferenceImages !== null) confidence += 1;
    if ((requirements.requiresAspectRatio || readString(requirements.aspectRatio))
      && model.capabilities.aspectRatios !== null) confidence += 1;
    return confidence;
  }

  private providerConfig(provider: string) {
    return this.appConfig.ai?.providers?.[provider];
  }

  private validatePreset(serviceType: AiServiceType, preset: AiModelPreset | null): AiModelPreset | null {
    if (!preset) return null;
    const descriptor = this.requireAdapter(preset.provider).descriptor;
    assertCapability(descriptor, serviceType);
    const runtime = this.requireProviderConfig(descriptor.id);
    if (runtime.enabled === false) throw new ValidationError(`${descriptor.label} 已在 config.yaml 中停用`);
    if (!readString(runtime.api_key)) throw new ValidationError(`${descriptor.label} 尚未配置 API Key`);
    const model = this.models(descriptor.id, serviceType).find((entry) => entry.id === preset.model);
    if (!model) throw new ValidationError(`${descriptor.label} 的实时目录中没有${serviceLabel(serviceType)}模型：${preset.model}`);
    return { provider: descriptor.id, model: model.id };
  }

  private requireProviderConfig(provider: string) {
    const config = this.providerConfig(provider);
    if (!config) throw new ValidationError(`config.yaml 中没有 ${provider} 供应商配置`);
    return config;
  }
}

const serviceTypes: AiServiceType[] = ['text', 'image', 'video'];

function assertCapability(descriptor: ProviderDescriptor, serviceType: AiServiceType): void {
  const supported = serviceType === 'text'
    ? descriptor.capabilities.text
    : serviceType === 'image'
      ? descriptor.capabilities.textToImage || descriptor.capabilities.imageToImage
      : descriptor.capabilities.textToVideo || descriptor.capabilities.imageToVideo;
  if (!supported) throw new ValidationError(`${descriptor.label} 不支持${serviceLabel(serviceType)}服务`);
}

function serviceLabel(serviceType: AiServiceType): string {
  return serviceType === 'text' ? '文本' : serviceType === 'image' ? '图片' : '视频';
}

function modeLabel(mode: ProviderModelMode): string {
  const labels: Record<ProviderModelMode, string> = {
    'text-to-image': '文生图',
    'image-to-image': '图生图',
    'text-to-video': '文生视频',
    'image-to-video': '图生视频',
  };
  return labels[mode];
}
