import { apiClient } from './client'

export const generationApi = {
  story: (data: Record<string, unknown>) => apiClient.post<never, { task_id?: string; status?: string }>('/generation/story', data),
  characters: (data: Record<string, unknown>) => apiClient.post<never, { task_id?: string; status?: string }>('/generation/characters', data),
  extractCharacters: (episodeId: number, data: Record<string, unknown> = {}) => apiClient.post<never, { task_id?: string }>(`/episodes/${episodeId}/characters/extract`, data),
  extractScenes: (episodeId: number, data: Record<string, unknown> = {}) => apiClient.post<never, { task_id?: string }>(`/images/episode/${episodeId}/backgrounds/extract`, data),
  extractProps: (episodeId: number, data: Record<string, unknown> = {}) => apiClient.post<never, { task_id?: string }>(`/episodes/${episodeId}/props/extract`, data),
}
