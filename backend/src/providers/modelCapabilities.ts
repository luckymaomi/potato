import type {
  ProviderModelCapabilities,
  ProviderModelCapabilitySource,
  ProviderModelMode,
} from './contracts';

const MODEL_MODES = new Set<ProviderModelMode>([
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video',
]);

const CAPABILITY_SOURCES = new Set<ProviderModelCapabilitySource>([
  'provider',
  'adapter',
  'unknown',
]);

export function modelCapabilities(
  modes: ProviderModelMode[],
  maxReferenceImages: number | null,
  aspectRatios: string[] | null,
  source: ProviderModelCapabilitySource,
): ProviderModelCapabilities {
  return {
    modes: [...new Set(modes)],
    maxReferenceImages: normalizeReferenceLimit(maxReferenceImages),
    aspectRatios: normalizeAspectRatios(aspectRatios),
    source,
  };
}

export function unknownModelCapabilities(): ProviderModelCapabilities {
  return modelCapabilities([], null, null, 'unknown');
}

export function parseModelCapabilities(value: unknown): ProviderModelCapabilities {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return unknownModelCapabilities();
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return unknownModelCapabilities();
  const record = parsed as Record<string, unknown>;
  const modes = Array.isArray(record.modes)
    ? record.modes.filter((mode): mode is ProviderModelMode => typeof mode === 'string' && MODEL_MODES.has(mode as ProviderModelMode))
    : [];
  const source = typeof record.source === 'string' && CAPABILITY_SOURCES.has(record.source as ProviderModelCapabilitySource)
    ? record.source as ProviderModelCapabilitySource
    : 'unknown';
  const aspectRatios = record.aspectRatios === null || record.aspectRatios === undefined
    ? null
    : Array.isArray(record.aspectRatios) ? record.aspectRatios : null;
  return modelCapabilities(modes, normalizeReferenceLimit(record.maxReferenceImages), aspectRatios, source);
}

export function modelSupportsMode(capabilities: ProviderModelCapabilities, mode: ProviderModelMode): boolean {
  return capabilities.modes.includes(mode);
}

export function modelSupportsAspectRatio(
  capabilities: ProviderModelCapabilities,
  aspectRatio: string,
): boolean {
  return capabilities.aspectRatios?.includes(aspectRatio) === true;
}

export function normalizeAspectRatios(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/u.test(entry)))];
}

function normalizeReferenceLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
