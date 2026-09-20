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
  current_video_generation_id?: number | null
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
  shot_size?: string | null
  camera_angle?: string | null
  camera_movement?: string | null
  composition?: string | null
  lighting?: string | null
  mood?: string | null
  sound?: string | null
  image_url?: string | null
  video_url?: string | null
  current_image_generation_id?: number | null
  current_video_generation_id?: number | null
  project_asset_ids?: number[]
  extra_reference_images?: string[]
}

export type AssetKind = 'character' | 'scene' | 'prop'

export type AssetTextProfile = Record<string, string | string[]>

export interface ProjectAsset {
  id: number
  drama_id: number
  kind: AssetKind
  name: string
  text_profile: AssetTextProfile
  input_reference_images: string[]
  image_url?: string | null
  local_path?: string | null
  current_image_generation_id?: number | null
}

export interface ProjectMetadata { aspect_ratio?: string; [key: string]: unknown }

export interface Project {
  id: number
  title: string
  description?: string | null
  genre?: string | null
  style?: string
  status?: string
  thumbnail?: string | null
  metadata: ProjectMetadata
  episodes?: Episode[]
  project_assets?: ProjectAsset[]
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
