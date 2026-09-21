import type { AssetKind, AssetOutputType, AssetTextProfile, Episode, ProjectAsset, Storyboard } from '../types/domain'
import type { MediaGenerationHistory } from './media'
import { apiClient } from './client'

export interface ProductionSubmission {
  status: 'pending' | 'completed'
  task_id?: string
  result?: Record<string, unknown>
}

export interface ScriptWorkspace {
  overview: StoryOverview
  episode: Episode
  episodes: Episode[]
}

export interface StoryOverview {
  story_hook: string
  worldview: string
  storyline: string
  tone: string
  reference_setting: string
}

export interface EpisodeStoryPlan {
  episode_goal: string
  conflict: string
  turning_point: string
  ending_hook: string
  scene_notes: string
}

export interface ScriptSceneDraft {
  title: string
  content: string
}

export interface StoryboardWorkspace {
  episode: Episode
  items: Storyboard[]
}

export interface GenerateMediaInput {
  provider?: string
  model?: string
  aspect_ratio?: string
  duration?: number
}

export interface StoryboardRecipes {
  imageRecipe: { imagePrompt: string; imageReferences: string[] }
  videoRecipe: { videoPrompt: string; videoReferences: string[] }
}

export interface StoryboardReadiness {
  image: { ready: boolean; reason?: string }
  video: { ready: boolean; reason?: string; warning?: string }
}

export const workspaceApi = {
  getScript: (projectId: number, episodeId?: number) => apiClient.get<never, ScriptWorkspace>(`/dramas/${projectId}/script`, { params: { episode_id: episodeId } }),
  saveScript: (projectId: number, input: { episode_id: number; overview: StoryOverview; episode_plan: EpisodeStoryPlan; script_content: string }) => apiClient.put<never, ScriptWorkspace>(`/dramas/${projectId}/script`, input),
  assembleScript: (projectId: number, input: { episode_id: number; scenes: ScriptSceneDraft[] }) => apiClient.post<never, { script_content: string }>(`/dramas/${projectId}/script/assemble`, input),

  assets: (projectId: number, kind?: AssetKind) => apiClient.get<never, { items: ProjectAsset[] }>(`/dramas/${projectId}/assets`, { params: { kind } }),
  createAsset: (projectId: number, input: Partial<ProjectAsset> & { kind: AssetKind }) => apiClient.post<never, ProjectAsset>(`/dramas/${projectId}/assets`, input),
  assembleAssetOutputPrompt: (projectId: number, input: { kind: AssetKind; name?: string; text_profile?: AssetTextProfile; output_type?: AssetOutputType }) => apiClient.post<never, { output_type: AssetOutputType; output_prompt: string }>(`/dramas/${projectId}/assets/assemble-output-prompt`, input),
  updateAsset: (projectId: number, id: number, input: Partial<ProjectAsset>) => apiClient.patch<never, ProjectAsset>(`/dramas/${projectId}/assets/${id}`, input),
  removeAsset: (projectId: number, id: number) => apiClient.delete<never, { removed: boolean }>(`/dramas/${projectId}/assets/${id}`),
  generateAssetImage: (projectId: number, id: number, input: GenerateMediaInput) => apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/assets/${id}/generate-image`, input),
  uploadAssetImage: (projectId: number, id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/assets/${id}/upload-image`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  storyboards: (projectId: number, episodeId?: number) => apiClient.get<never, StoryboardWorkspace>(`/dramas/${projectId}/storyboards`, { params: { episode_id: episodeId } }),
  createStoryboard: (projectId: number, input: Partial<Storyboard> & { episode_id: number }) => apiClient.post<never, Storyboard>(`/dramas/${projectId}/storyboards`, input),
  updateStoryboard: (projectId: number, id: number, input: Partial<Storyboard> & { recipe_reassembled?: boolean }) => apiClient.patch<never, Storyboard>(`/dramas/${projectId}/storyboards/${id}`, input),
  storyboardReadiness: (projectId: number, id: number) => apiClient.get<never, StoryboardReadiness>(`/dramas/${projectId}/storyboards/${id}/readiness`),
  confirmStoryboardReview: (projectId: number, id: number, media: 'image' | 'video') => apiClient.post<never, Storyboard>(`/dramas/${projectId}/storyboards/${id}/confirm-review`, { media }),
  assembleStoryboardRecipes: (projectId: number, id: number, input: Partial<Storyboard>) => apiClient.post<never, StoryboardRecipes>(`/dramas/${projectId}/storyboards/${id}/assemble-recipes`, input),
  removeStoryboard: (projectId: number, id: number) => apiClient.delete<never, { removed: boolean }>(`/dramas/${projectId}/storyboards/${id}`),
  generateStoryboardImage: (projectId: number, id: number, input: GenerateMediaInput = {}) => apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/storyboards/${id}/generate-image`, input),
  uploadStoryboardImage: (projectId: number, id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/storyboards/${id}/upload-image`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  clearStoryboardImage: (projectId: number, id: number) => apiClient.delete<never, { cleared: boolean; storyboard: Storyboard }>(`/dramas/${projectId}/storyboards/${id}/current-image`),
  generateStoryboardVideo: (projectId: number, id: number, input: GenerateMediaInput = {}) => apiClient.post<never, MediaGenerationHistory>(`/dramas/${projectId}/storyboards/${id}/generate-video`, input),
  compose: (projectId: number, episodeId: number) => apiClient.post<never, ProductionSubmission>(`/dramas/${projectId}/episodes/${episodeId}/compose`),
  exportPreview: (projectId: number, episodeId: number) => apiClient.get<never, Blob>(`/dramas/${projectId}/episodes/${episodeId}/export-preview`, { responseType: 'blob' }),
  exportShots: (projectId: number, episodeId: number, storyboardIds: number[] = []) => apiClient.post<never, Blob>(`/dramas/${projectId}/episodes/${episodeId}/export-shots`, { storyboard_ids: storyboardIds }, { responseType: 'blob' }),
}
