import type { AssetKind, AssetLibraryItem, Episode, ProjectAsset, Storyboard } from '../types/domain'
import type { MediaGenerationHistory } from './media'
import type { ProductionSubmission } from './production'
import { apiClient } from './client'

export interface ScriptWorkspace {
  overview: string
  episode: Episode
  episodes: Episode[]
}

export interface StoryboardWorkspace {
  episode: Episode
  items: Storyboard[]
}

export interface GenerateMediaInput {
  prompt?: string
  reference_images?: string[]
  provider?: string
  model?: string
  aspect_ratio?: string
  duration?: number
}

export interface BatchSubmission {
  status?: 'pending'
  task_id?: string
  queued?: number
  submitted?: number
  items?: unknown[]
}

export const workspaceApi = {
  getScript: (projectId: number, episodeId?: number) => apiClient.get<never, ScriptWorkspace>(`/dramas/${projectId}/script`, { params: { episode_id: episodeId } }),
  saveScript: (projectId: number, input: { episode_id: number; overview: string; script_content: string }) => apiClient.put<never, ScriptWorkspace>(`/dramas/${projectId}/script`, input),

  library: (kind?: AssetKind) => apiClient.get<never, { items: AssetLibraryItem[] }>('/asset-library', { params: { kind } }),
  createLibraryItem: (input: Partial<AssetLibraryItem> & { kind: AssetKind }) => apiClient.post<never, AssetLibraryItem>('/asset-library', input),
  updateLibraryItem: (id: number, input: Partial<AssetLibraryItem>) => apiClient.patch<never, AssetLibraryItem>(`/asset-library/${id}`, input),
  generateLibraryImage: (id: number, input: GenerateMediaInput) => apiClient.post<never, MediaGenerationHistory>(`/asset-library/${id}/generate-image`, input),

  assets: (projectId: number, kind?: AssetKind) => apiClient.get<never, { items: ProjectAsset[] }>(`/dramas/${projectId}/assets`, { params: { kind } }),
  createAsset: (projectId: number, input: Partial<ProjectAsset> & { kind?: AssetKind; from_library_item_id?: number }) => apiClient.post<never, ProjectAsset>(`/dramas/${projectId}/assets`, input),
  updateAsset: (projectId: number, id: number, input: Partial<ProjectAsset>) => apiClient.patch<never, ProjectAsset>(`/dramas/${projectId}/assets/${id}`, input),
  removeAsset: (projectId: number, id: number) => apiClient.delete<never, { removed: boolean }>(`/dramas/${projectId}/assets/${id}`),
  lockAsset: (projectId: number, id: number) => apiClient.post<never, ProjectAsset>(`/dramas/${projectId}/assets/${id}/lock-current`),
  upgradeAsset: (projectId: number, id: number) => apiClient.post<never, ProjectAsset>(`/dramas/${projectId}/assets/${id}/upgrade-lock`),
  generateAssetImage: (projectId: number, id: number, input: GenerateMediaInput) => apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/assets/${id}/generate-image`, input),
  extractAssets: (projectId: number, input: { kind: AssetKind; episode_id: number; source_text?: string }) => apiClient.post<never, ProductionSubmission>(`/dramas/${projectId}/assets/extract`, input),
  batchGenerateAssets: (projectId: number, input: { kind?: AssetKind; asset_ids?: number[] }) => apiClient.post<never, BatchSubmission>(`/dramas/${projectId}/assets/generate-batch`, input),

  storyboards: (projectId: number, episodeId?: number) => apiClient.get<never, StoryboardWorkspace>(`/dramas/${projectId}/storyboards`, { params: { episode_id: episodeId } }),
  createStoryboard: (projectId: number, input: Partial<Storyboard> & { episode_id: number }) => apiClient.post<never, Storyboard>(`/dramas/${projectId}/storyboards`, input),
  updateStoryboard: (projectId: number, id: number, input: Partial<Storyboard>) => apiClient.patch<never, Storyboard>(`/dramas/${projectId}/storyboards/${id}`, input),
  removeStoryboard: (projectId: number, id: number) => apiClient.delete<never, { removed: boolean }>(`/dramas/${projectId}/storyboards/${id}`),
  splitStoryboards: (projectId: number, input: { episode_id: number; storyboard_count?: number; source_text?: string }) => apiClient.post<never, ProductionSubmission>(`/dramas/${projectId}/storyboards/split`, input),
  generateStoryboardImage: (projectId: number, id: number, input: GenerateMediaInput = {}) => apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/storyboards/${id}/generate-image`, input),
  generateStoryboardVideo: (projectId: number, id: number, input: GenerateMediaInput = {}) => apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/storyboards/${id}/generate-video`, input),
  batchProduce: (projectId: number, input: { episode_id: number; target: 'images' | 'videos'; confirm_cost?: boolean }) => apiClient.post<never, BatchSubmission>(`/dramas/${projectId}/produce/batch`, input),
  compose: (projectId: number, episodeId: number) => apiClient.post<never, ProductionSubmission>(`/dramas/${projectId}/episodes/${episodeId}/compose`),
}
