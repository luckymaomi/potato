import { createPearApiAdapter } from './adapters/pearApi';
import { createAgnesAdapter } from './adapters/agnes';
import type { ProviderAdapter } from './contracts';
import { ProviderRegistry } from './registry';

export const BUILTIN_PROVIDER_ADAPTERS = [
  createPearApiAdapter,
  createAgnesAdapter,
] as const;

export function createProviderRegistry(extraAdapters: readonly ProviderAdapter[] = []): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const createAdapter of BUILTIN_PROVIDER_ADAPTERS) registry.register(createAdapter());
  for (const adapter of extraAdapters) registry.register(adapter);
  return registry;
}

export const providerRegistry = createProviderRegistry();

export * from './contracts';
export * from './errors';
export * from './registry';
export * from './runtime';
export * from './transport';
