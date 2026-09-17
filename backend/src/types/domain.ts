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
  characters?: CharacterRow[];
  scenes?: SceneRow[];
  props?: PropRow[];
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
  created_at: string;
  updated_at: string;
}

export interface SceneRow {
  id: number;
  drama_id: number;
  episode_id: number | null;
  location: string;
  prompt: string | null;
  image_url: string | null;
  local_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropRow {
  id: number;
  drama_id: number;
  episode_id: number | null;
  name: string;
  description: string | null;
  prompt: string | null;
  image_url: string | null;
  local_path: string | null;
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
  duration: number | null;
  created_at: string;
  updated_at: string;
}

export type EntityKind = 'character' | 'scene' | 'prop';
