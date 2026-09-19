import type { MediaGenerationMode } from '../types/production'
import { AppError } from '../errors/appError'
import type { GenerationTask } from './tasks'
import { apiClient } from './client'

interface ProductionCommandBase {
  project_id: number
  provider?: string
  model?: string
  audit?: ProductionAuditContext
}

export interface ProductionAuditContext {
  run_id?: string
  node_id?: string
  node_title?: string
  node_role?: string
}

export type ProductionCommand =
  | (ProductionCommandBase & { kind: 'manual-text'; episode_id?: number; text: string; persist_as_script: boolean })
  | (ProductionCommandBase & { kind: 'image'; mode: Extract<MediaGenerationMode, 'text-to-image' | 'image-to-image'>; prompt: string; aspect_ratio?: string; reference_images: string[]; target?: { kind: 'character' | 'scene' | 'prop' | 'storyboard'; id: number } })
  | (ProductionCommandBase & { kind: 'video'; mode: Extract<MediaGenerationMode, 'text-to-video' | 'image-to-video'>; prompt: string; aspect_ratio?: string; duration?: number; reference_images: string[]; storyboard_id?: number })
  | { kind: 'finalize'; project_id: number; episode_id: number; video_urls: string[]; audit?: ProductionAuditContext }

export interface ProductionSubmission {
  status: 'pending' | 'completed'
  task_id?: string
  result?: Record<string, unknown>
}

export const productionApi = {
  execute: (command: ProductionCommand) => apiClient.post<never, ProductionSubmission>('/production/execute', command),
}

export function taskFailure(task: GenerationTask, fallback: string): AppError {
  if (task.failure) return new AppError(task.failure)
  return new AppError({ code: 'TASK_FAILED', message: task.error || task.message || fallback, retryable: false })
}
