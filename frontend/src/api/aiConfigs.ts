import type { ProviderCatalogStatus, ProviderModel, ServiceType } from '../types/domain'
import { apiClient } from './client'

export const aiConfigsApi = {
  providers: () => apiClient.get<never, ProviderCatalogStatus[]>('/ai-configs/providers'),
  models: (params: { provider?: string; service_type?: ServiceType } = {}) =>
    apiClient.get<never, ProviderModel[]>('/ai-configs/models', { params }),
  refreshModels: (provider: string, serviceType?: ServiceType) =>
    apiClient.post<never, ProviderModel[]>('/ai-configs/models/refresh', {
      provider,
      ...(serviceType ? { service_type: serviceType } : {}),
    }),
}
