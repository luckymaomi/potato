import { apiClient } from './client'

export interface ImageGeneration {
  id: number
  drama_id?: number
  storyboard_id?: number | null
  scene_id?: number | null
  character_id?: number | null
  prompt?: string
  model?: string | null
  image_url?: string | null
  local_path?: string | null
  status?: string
  task_id?: string | null
  error_msg?: string | null
}

export interface VideoGeneration {
  id: number
  drama_id?: number
  storyboard_id?: number | null
  prompt?: string
  model?: string | null
  image_url?: string | null
  video_url?: string | null
  local_path?: string | null
  status?: string
  task_id?: string | null
  error_msg?: string | null
}

export interface ImageGenerationInput {
  drama_id: number
  prompt: string
  model?: string
  provider?: string
  size?: string
  aspect_ratio?: string
  storyboard_id?: number | null
  scene_id?: number | null
  reference_images?: string[]
  frame_type?: string
}

export interface VideoGenerationInput {
  drama_id: number
  prompt: string
  model?: string
  provider?: string
  duration?: number
  aspect_ratio?: string
  resolution?: string
  storyboard_id?: number | null
  image_url?: string
  first_frame_url?: string
  last_frame_url?: string
  reference_image_urls?: string[]
}

export const imagesApi = {
  list: (params: Record<string, unknown> = {}) => apiClient.get<never, { items: ImageGeneration[] }>('/images', { params }),
  get: (id: number) => apiClient.get<never, ImageGeneration>(`/images/${id}`),
  create: (data: ImageGenerationInput) => apiClient.post<never, ImageGeneration>('/images', data),
}

export const videosApi = {
  list: (params: Record<string, unknown> = {}) => apiClient.get<never, { items: VideoGeneration[] }>('/videos', { params }),
  get: (id: number) => apiClient.get<never, VideoGeneration>(`/videos/${id}`),
  create: (data: VideoGenerationInput) => apiClient.post<never, VideoGeneration>('/videos', data),
  resumePoll: (id: number) => apiClient.post<never, VideoGeneration>(`/videos/${id}/resume-poll`),
}

export const uploadsApi = {
  image: (file: File, projectId?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (projectId) form.append('drama_id', String(projectId))
    return apiClient.post<never, { url: string; path?: string; local_path?: string }>('/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}
