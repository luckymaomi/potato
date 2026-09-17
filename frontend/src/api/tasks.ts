import { apiClient } from './client'

export interface TaskResult { image_url?: string; video_url?: string; [key: string]: unknown }
export interface GenerationTask { id: string; type: string; status: string; progress?: number; message?: string; error?: string; result?: string | TaskResult | null; resource_id?: string }

export const tasksApi = {
  get: (id: string) => apiClient.get<never, GenerationTask>(`/tasks/${id}`),
  cancel: (id: string, reason?: string) => apiClient.post(`/tasks/${id}/cancel`, reason ? { reason } : {}),
}
