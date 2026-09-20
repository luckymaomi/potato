import type { AiServiceConfig } from '../types/ai';
import type { ProviderAdapter, ProviderDescriptor, ProviderKind } from './contracts';
import { ProviderError } from './errors';

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly aliases = new Map<string, string>();

  register(adapter: ProviderAdapter): void {
    const id = normalize(adapter.descriptor.id);
    if (!id) throw new Error('Provider adapter id 不能为空');
    if (this.adapters.has(id)) throw new Error(`Provider adapter 已注册：${id}`);
    this.adapters.set(id, adapter);
    for (const alias of [id, ...adapter.descriptor.aliases]) {
      const normalizedAlias = normalize(alias);
      const owner = this.aliases.get(normalizedAlias);
      if (owner && owner !== id) throw new Error(`Provider alias 冲突：${normalizedAlias}`);
      this.aliases.set(normalizedAlias, id);
    }
  }

  get(idOrAlias: string): ProviderAdapter | undefined {
    const id = this.aliases.get(normalize(idOrAlias)) ?? normalize(idOrAlias);
    return this.adapters.get(id);
  }

  resolve(input: {
    kind: ProviderKind;
    config: AiServiceConfig;
    model: string;
  }): ProviderAdapter | undefined {
    const provider = normalize(input.config.provider);
    const providerAdapter = this.get(provider);
    if (providerAdapter && supportsKind(providerAdapter, input.kind)) return providerAdapter;
    return undefined;
  }

  require(input: {
    kind: ProviderKind;
    config: AiServiceConfig;
    model: string;
  }): ProviderAdapter {
    const adapter = this.resolve(input);
    if (adapter) return adapter;
    throw new ProviderError({
      providerId: normalize(input.config.provider) || 'unknown',
      code: 'configuration',
      message: `没有可处理 ${input.kind} 请求的 Provider 适配器`,
    });
  }

  list(kind?: ProviderKind): ProviderDescriptor[] {
    return [...this.adapters.values()]
      .filter((adapter) => !kind || supportsKind(adapter, kind))
      .map((adapter) => adapter.descriptor);
  }
}

function supportsKind(adapter: ProviderAdapter, kind: ProviderKind): boolean {
  if (kind === 'image') return typeof adapter.submitImage === 'function';
  return typeof adapter.submitVideo === 'function';
}
