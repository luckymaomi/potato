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
  canvas_revision: number;
  created_at: string;
  updated_at: string;
}

export interface Drama extends Omit<DramaRow, 'metadata'> {
  metadata: JsonObject;
  episodes?: EpisodeRow[];
  characters?: CharacterRow[];
  scenes?: SceneRow[];
  props?: PropRow[];
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

export interface CharacterRow {
  id: number;
  drama_id: number;
  name: string;
  description: string | null;
  appearance: string | null;
  image_url: string | null;
  local_path: string | null;
  current_image_generation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SceneRow {
  id: number;
  drama_id: number;
  location: string;
  prompt: string | null;
  image_url: string | null;
  local_path: string | null;
  current_image_generation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PropRow {
  id: number;
  drama_id: number;
  name: string;
  description: string | null;
  prompt: string | null;
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
  image_url: string | null;
  video_url: string | null;
  current_image_generation_id: number | null;
  current_video_generation_id: number | null;
  character_ids: number[];
  scene_ids: number[];
  prop_ids: number[];
  duration: number | null;
  created_at: string;
  updated_at: string;
}

export type EntityKind = 'character' | 'scene' | 'prop';
