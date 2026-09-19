import { apiClient } from './client'

export interface MediaGenerationHistory {
  id: number
  drama_id: number | null
  library_item_id?: number | null
  project_asset_id?: number | null
  episode_id?: number | null
  storyboard_id?: number | null
  scene_id?: number | null
  character_id?: number | null
  prop_id?: number | null
  prompt: string
  provider?: string | null
  model?: string | null
  image_url?: string | null
  video_url?: string | null
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
  videos: (projectId: number) => apiClient.get<never, { items: MediaGenerationHistory[] }>('/videos', { params: { drama_id: projectId } }),
  selectImage: (id: number) => apiClient.post<never, MediaGenerationHistory>(`/images/${id}/select`),
  selectVideo: (id: number) => apiClient.post<never, MediaGenerationHistory>(`/videos/${id}/select`),
}
