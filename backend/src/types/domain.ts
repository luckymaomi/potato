import type { JsonObject } from './core';

export interface DramaRow {
  id: number;
  title: string;
  description: string | null;
  genre: string | null;
  style: string;
  status: string;
  thumbnail: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface Drama extends Omit<DramaRow, 'metadata'> {
  metadata: JsonObject;
  episodes?: EpisodeRow[];
  project_assets?: ProjectAssetRow[];
  media_lifecycle?: {
    images: Record<string, MediaLifecycleState>;
    videos: Record<string, MediaLifecycleState>;
  };
}

export interface MediaLifecycleState {
  generation_id: number;
  status: string;
  url: string | null;
  local_path: string | null;
  failure_stage: 'provider' | 'archive' | 'composition' | null;
  available: boolean;
}

export interface EpisodeRow {
  id: number;
  drama_id: number;
  episode_number: number;
  title: string;
  duration: number;
  script_content: string | null;
  description: string | null;
  video_url: string | null;
  current_video_generation_id: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  storyboards?: StoryboardRow[];
}

export type AssetKind = 'character' | 'scene' | 'prop';
export type AssetTextProfile = Record<string, string | string[]>;

export interface ProjectAssetRow {
  id: number;
  drama_id: number;
  kind: AssetKind;
  name: string;
  text_profile: AssetTextProfile;
  input_reference_images: string[];
  image_url: string | null;
  local_path: string | null;
  current_image_generation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface StoryboardRow {
  id: number;
  episode_id: number;
  storyboard_number: number;
  title: string | null;
  description: string | null;
  action: string | null;
  dialogue: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  shot_size: string | null;
  camera_angle: string | null;
  camera_movement: string | null;
  composition: string | null;
  lighting: string | null;
  mood: string | null;
  sound: string | null;
  image_url: string | null;
  video_url: string | null;
  current_image_generation_id: number | null;
  current_video_generation_id: number | null;
  project_asset_ids: number[];
  extra_reference_images: string[];
  created_at: string;
  updated_at: string;
}
