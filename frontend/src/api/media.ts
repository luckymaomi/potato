import { apiClient } from './client'

export interface MediaGenerationHistory {
  id: number
  drama_id: number
  project_asset_id?: number | null
  episode_id?: number | null
  panel_id?: number | null
  prompt: string
  provider?: string | null
  model?: string | null
  image_url?: string | null
  source_url?: string | null
  local_path?: string | null
  media_type?: string | null
  file_size?: number | null
  status: string
  failure_stage?: 'provider' | 'archive' | 'composition' | null
  error_msg?: string | null
  task_id?: string | null
  created_at: string
  completed_at?: string | null
  available: boolean
  archive_attempts?: number
}

export const uploadsApi = {
  image: (file: File, projectId?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (projectId) form.append('drama_id', String(projectId))
    return apiClient.post<never, { url: string; path?: string; local_path?: string }>('/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

export const mediaHistoryApi = {
  images: (projectId: number) => apiClient.get<never, { items: MediaGenerationHistory[] }>('/images', { params: { drama_id: projectId } }),
  selectImage: (id: number) => apiClient.post<never, MediaGenerationHistory>(`/images/${id}/select`),
  removeImage: (id: number) => apiClient.delete<never, { removed: boolean }>(`/images/${id}`),
}
