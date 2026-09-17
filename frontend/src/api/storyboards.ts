import type { Storyboard } from '../types/domain'
import { apiClient } from './client'

export const storyboardsApi = {
  create: (data: Partial<Storyboard> & { episode_id: number }) => apiClient.post<never, Storyboard>('/storyboards', data),
  get: (id: number) => apiClient.get<never, Storyboard>(`/storyboards/${id}`),
  update: (id: number, data: Partial<Storyboard>) => apiClient.put<never, Storyboard>(`/storyboards/${id}`, data),
  generate: (episodeId: number, data: Record<string, unknown> = {}) => apiClient.post<never, { task_id?: string; status?: string }>(`/episodes/${episodeId}/storyboards`, data),
  list: (episodeId: number) => apiClient.get<never, { storyboards: Storyboard[] }>(`/episodes/${episodeId}/storyboards`),
}
