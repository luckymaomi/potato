export type ServiceType = 'text' | 'image' | 'video'
export type ProviderModelMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
export type VideoBillingMode = 'duration' | 'per-request' | 'unknown'

export interface AiModelPreset {
  provider: string
  model: string
}

export type AiModelPresets = Record<ServiceType, AiModelPreset | null>

export interface Episode {
  id: number
  drama_id: number
  episode_number: number
  title: string
  duration?: number
  script_content?: string | null
  description?: string | null
  video_url?: string | null
  current_image_generation_id?: number | null
  current_video_generation_id?: number | null
  character_ids?: number[]
  scene_ids?: number[]
  prop_ids?: number[]
  status?: string
  storyboards?: Storyboard[]
}

export interface Storyboard {
  id: number
  episode_id: number
  storyboard_number: number
  title?: string | null
  description?: string | null
  action?: string | null
  dialogue?: string | null
  image_prompt?: string | null
  video_prompt?: string | null
  image_url?: string | null
  video_url?: string | null
  current_image_generation_id?: number | null
  current_video_generation_id?: number | null
  duration?: number | null
}

export interface Character { id: number; drama_id: number; name: string; description?: string | null; appearance?: string | null; image_url?: string | null; local_path?: string | null; current_image_generation_id?: number | null }
export interface Scene { id: number; drama_id: number; location: string; prompt?: string | null; image_url?: string | null; local_path?: string | null; current_image_generation_id?: number | null }
export interface Prop { id: number; drama_id: number; name: string; description?: string | null; prompt?: string | null; image_url?: string | null; local_path?: string | null; current_image_generation_id?: number | null }

export interface ProjectMetadata { aspect_ratio?: string; canvas_layout?: unknown; [key: string]: unknown }

export interface Project {
  id: number
  title: string
  description?: string | null
  genre?: string | null
  style?: string
  status?: string
  thumbnail?: string | null
  metadata: ProjectMetadata
  canvas_revision: number
  episodes?: Episode[]
  characters?: Character[]
  scenes?: Scene[]
  props?: Prop[]
  media_lifecycle?: {
    images: Record<string, MediaLifecycleState>
    videos: Record<string, MediaLifecycleState>
  }
  created_at?: string
  updated_at?: string
}

export interface MediaLifecycleState {
  generation_id: number
  status: string
  url?: string | null
  local_path?: string | null
  failure_stage?: 'provider' | 'archive' | 'composition' | null
  available: boolean
}

export interface ProviderCapabilities {
  text: boolean
  textToImage: boolean
  imageToImage: boolean
  textToVideo: boolean
  imageToVideo: boolean
  asynchronous: boolean
  multipleImageReferences: boolean
  firstLastFrame: boolean
}

export interface ProviderCatalogStatus {
  id: string
  label: string
  aliases: string[]
  capabilities: ProviderCapabilities
  enabled: boolean
  configured: boolean
  model_counts: Record<ServiceType, number>
  synchronized_at: string | null
}

export interface ProviderModel {
  provider: string
  id: string
  label: string
  kind: ServiceType
  capabilities: {
    modes: ProviderModelMode[]
    maxReferenceImages: number | null
    aspectRatios: string[] | null
    billingMode?: VideoBillingMode
    supportsDuration?: boolean
    supportedDurations?: number[] | null
    source: 'provider' | 'adapter' | 'unknown'
  }
  synchronized_at: string
}

export interface Pagination { page: number; page_size: number; total: number; total_pages: number }
export interface PageResult<T> { items: T[]; pagination: Pagination }
