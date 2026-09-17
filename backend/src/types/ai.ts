import type { JsonValue } from './core';
import type { ProviderCapabilities, ProviderModel } from '../providers/contracts';

export type AiServiceType = 'text' | 'image' | 'video';
export interface AiConfigSettings {
  task_type?: 'sync' | 'async';
  [key: string]: JsonValue | undefined;
}

export interface AiServiceConfig {
  id: number;
  service_type: AiServiceType;
  provider: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string[];
  default_model: string | null;
  endpoint: string;
  query_endpoint: string;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  settings: AiConfigSettings | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderCatalogStatus {
  id: string;
  label: string;
  aliases: readonly string[];
  capabilities: ProviderCapabilities;
  enabled: boolean;
  configured: boolean;
  model_counts: Record<AiServiceType, number>;
  synchronized_at: string | null;
}

export interface ProviderModelSnapshot extends ProviderModel {
  provider: string;
  synchronized_at: string;
}
