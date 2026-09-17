import { apiClient } from './client'
import type { StructuredFailure } from '../errors/appError'

export interface TaskResult { image_url?: string; video_url?: string; [key: string]: unknown }
export type GenerationTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
export interface GenerationTask { id: string; type: string; status: GenerationTaskStatus; progress?: number; message?: string; error?: string; failure?: StructuredFailure | null; result?: string | TaskResult | null; resource_id?: string }

export const tasksApi = {
  get: (id: string) => apiClient.get<never, GenerationTask>(`/tasks/${id}`),
  cancel: (id: string, reason?: string) => apiClient.post<never, GenerationTask>(`/tasks/${id}/cancel`, reason ? { reason } : {}),
}
