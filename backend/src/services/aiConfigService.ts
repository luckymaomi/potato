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
import type { AiServiceConfig, AiServiceType, ProviderCatalogStatus, ProviderModelSnapshot } from '../types/ai';
import type { AppConfig, SQLiteDatabase } from '../types/core';
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
    const descriptors = this.registry.list(serviceType)
      .filter((descriptor) => !requestedProvider || descriptor.id === requestedProvider)
      .filter((descriptor) => {
        const runtime = this.providerConfig(descriptor.id);
        return runtime?.enabled !== false && Boolean(readString(runtime?.api_key));
      });

    for (const descriptor of descriptors) {
      const available = this.models(descriptor.id, serviceType);
      const configuredDefault = readString(this.providerConfig(descriptor.id)?.default_models?.[serviceType]);
      const configuredModel = configuredDefault
        ? available.find((entry) => entry.id === configuredDefault)
        : undefined;
      if (configuredDefault && !configuredModel) {
        throw new ValidationError(`${descriptor.label} 在 config.yaml 设置的默认${serviceLabel(serviceType)}模型不在实时目录：${configuredDefault}`);
      }
      const compatible = available.filter((entry) => this.matchesRequirements(entry, requirements));
      const selectedModel = model
        ? available.find((entry) => entry.id === model)
        : configuredModel && this.matchesRequirements(configuredModel, requirements)
          ? configuredModel
          : compatible[0];
      if (!selectedModel) continue;
      this.assertRequirements(selectedModel, requirements);
      return this.executionConfig(descriptor, serviceType, available, selectedModel.id);
    }

    if (model) throw new ValidationError(`动态模型目录中没有可用的 ${model}`);
    if (requirements.aspectRatio) throw new ValidationError(`动态模型目录中没有支持画幅比例 ${requirements.aspectRatio} 的模型`);
    if (requirements.requiresAspectRatio) throw new ValidationError(`动态模型目录中没有已确认画幅比例能力的${serviceLabel(serviceType)}模型`);
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
      throw new ValidationError(`模型 ${model.label} 的画幅比例能力未知，请刷新模型目录或选择已标明比例的模型`);
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
    if (requirements.mode && !modelSupportsMode(model.capabilities, requirements.mode)) {
      const known = model.capabilities.source === 'unknown'
        ? '能力信息未知，请先刷新模型目录'
        : `不支持${modeLabel(requirements.mode)}`;
      throw new ValidationError(`模型 ${model.label} ${known}`);
    }
    const referenceCount = Math.max(0, requirements.referenceImageCount ?? 0);
    if (referenceCount > 0 && model.capabilities.maxReferenceImages === null) {
      throw new ValidationError(`模型 ${model.label} 的参考图上限未知，请刷新模型目录或选择已标明上限的模型`);
    }
    if (model.capabilities.maxReferenceImages !== null && referenceCount > model.capabilities.maxReferenceImages) {
      throw new ValidationError(`模型 ${model.label} 最多支持 ${model.capabilities.maxReferenceImages} 张参考图，当前为 ${referenceCount} 张`);
    }
    if (requirements.requiresAspectRatio
      && (!model.capabilities.aspectRatios || model.capabilities.aspectRatios.length === 0)) {
      throw new ValidationError(`模型 ${model.label} 的画幅比例能力未知，请刷新模型目录或选择已标明比例的模型`);
    }
    const aspectRatio = readString(requirements.aspectRatio);
    if (aspectRatio && model.capabilities.aspectRatios === null) {
      throw new ValidationError(`模型 ${model.label} 的画幅比例能力未知，请刷新模型目录或选择已标明比例的模型`);
    }
    if (aspectRatio && !modelSupportsAspectRatio(model.capabilities, aspectRatio)) {
      throw new ValidationError(`模型 ${model.label} 不支持画幅比例 ${aspectRatio}，可用比例：${model.capabilities.aspectRatios?.join('、') || '未知'}`);
    }
  }

  private matchesRequirements(model: ProviderModelSnapshot, requirements: ModelSelectionRequirements): boolean {
    if (requirements.mode && !modelSupportsMode(model.capabilities, requirements.mode)) return false;
    const referenceCount = Math.max(0, requirements.referenceImageCount ?? 0);
    if (referenceCount > 0 && (model.capabilities.maxReferenceImages === null
      || referenceCount > model.capabilities.maxReferenceImages)) return false;
    if (requirements.requiresAspectRatio
      && (!model.capabilities.aspectRatios || model.capabilities.aspectRatios.length === 0)) return false;
    const aspectRatio = readString(requirements.aspectRatio);
    if (aspectRatio && !modelSupportsAspectRatio(model.capabilities, aspectRatio)) return false;
    return true;
  }

  private providerConfig(provider: string) {
    return this.appConfig.ai?.providers?.[provider];
  }

  private requireProviderConfig(provider: string) {
    const config = this.providerConfig(provider);
    if (!config) throw new ValidationError(`config.yaml 中没有 ${provider} 供应商配置`);
    return config;
  }
}

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
