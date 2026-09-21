import type { Episode, PageResult, Project } from '../types/domain'
import { apiClient } from './client'

export const projectsApi = {
  list: (params: { page?: number; page_size?: number; keyword?: string } = {}) => apiClient.get<never, PageResult<Project>>('/dramas', { params }),
  get: (id: number | string) => apiClient.get<never, Project>(`/dramas/${id}`),
  create: (data: Pick<Project, 'title'> & Partial<Project>) => apiClient.post<never, Project>('/dramas', data),
  update: (id: number | string, data: Partial<Project>) => apiClient.put<never, Project>(`/dramas/${id}`, data),
  remove: (id: number | string) => apiClient.delete<never, { removed: boolean }>(`/dramas/${id}`),
  saveEpisodes: (id: number | string, episodes: Partial<Episode>[]) => apiClient.put<never, { episodes: Episode[] }>(`/dramas/${id}/episodes`, { episodes }),
  updateEpisode: (id: number | string, episodeId: number, data: Partial<Pick<Episode, 'title' | 'episode_number' | 'description' | 'status'>>) => apiClient.patch<never, Episode>(`/dramas/${id}/episodes/${episodeId}`, data),
  removeEpisode: (id: number | string, episodeId: number) => apiClient.delete<never, { removed: boolean }>(`/dramas/${id}/episodes/${episodeId}`),
}
