import type { AiModelPreset, AiModelPresets, ProviderCatalogStatus, ProviderModel, ServiceType } from '../../types/domain'

export interface ModelPresetOption {
  value: string
  label: string
  disabled?: boolean
}

export function emptyModelPresets(): AiModelPresets {
  return { text: null, image: null, video: null }
}

export function modelPresetKey(preset: AiModelPreset | null): string | undefined {
  return preset ? JSON.stringify([preset.provider, preset.model]) : undefined
}

export function modelPresetFromKey(value: string | undefined): AiModelPreset | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [provider, model] = parsed
    return typeof provider === 'string' && provider && typeof model === 'string' && model
      ? { provider, model }
      : null
  } catch {
    return null
  }
}

export function modelPresetOptions(
  serviceType: ServiceType,
  models: ProviderModel[],
  providers: ProviderCatalogStatus[],
  current: AiModelPreset | null,
): ModelPresetOption[] {
  const usableProviders = new Map(providers
    .filter((provider) => provider.enabled && provider.configured)
    .map((provider) => [provider.id, provider.label]))
  const options: ModelPresetOption[] = models
    .filter((model) => model.kind === serviceType && usableProviders.has(model.provider))
    .map((model) => ({
      value: modelPresetKey({ provider: model.provider, model: model.id }) as string,
      label: `${usableProviders.get(model.provider)} · ${model.id}`,
    }))
  const currentKey = modelPresetKey(current)
  if (current && currentKey && !options.some((option) => option.value === currentKey)) {
    options.unshift({
      value: currentKey,
      label: `当前预设不可用 · ${current.provider} · ${current.model}`,
      disabled: true,
    })
  }
  return options
}
