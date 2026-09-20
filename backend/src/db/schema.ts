import type { SQLiteDatabase } from '../types/core';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dramas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  story_hook TEXT NOT NULL DEFAULT '',
  worldview TEXT NOT NULL DEFAULT '',
  storyline TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  reference_setting TEXT NOT NULL DEFAULT '',
  genre TEXT,
  style TEXT NOT NULL DEFAULT 'realistic',
  status TEXT NOT NULL DEFAULT 'draft',
  thumbnail TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  script_content TEXT,
  description TEXT,
  episode_goal TEXT NOT NULL DEFAULT '',
  conflict TEXT NOT NULL DEFAULT '',
  turning_point TEXT NOT NULL DEFAULT '',
  ending_hook TEXT NOT NULL DEFAULT '',
  scene_notes TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  current_video_generation_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(drama_id, episode_number)
);
CREATE TABLE IF NOT EXISTS project_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('character', 'scene', 'prop')),
  name TEXT NOT NULL,
  text_profile TEXT NOT NULL DEFAULT '{}',
  output_type TEXT NOT NULL,
  output_prompt TEXT NOT NULL DEFAULT '',
  input_reference_images TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  local_path TEXT,
  current_image_generation_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind = 'character' AND output_type IN ('character-layout-a', 'character-layout-b', 'character-layout-c', 'character-layout-d')) OR
    (kind = 'scene' AND output_type IN ('scene-panorama', 'scene-detail', 'scene-lighting-variant')) OR
    (kind = 'prop' AND output_type IN ('prop-multi-angle', 'prop-state-variant'))
  )
);
CREATE TABLE IF NOT EXISTS storyboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  storyboard_number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  action TEXT,
  dialogue TEXT,
  shot_size TEXT,
  camera_angle TEXT,
  camera_movement TEXT,
  composition TEXT,
  lighting TEXT,
  mood TEXT,
  sound TEXT,
  image_prompt TEXT,
  video_prompt TEXT,
  image_recipe_prompt TEXT NOT NULL DEFAULT '',
  video_recipe_prompt TEXT NOT NULL DEFAULT '',
  image_recipe_references TEXT NOT NULL DEFAULT '[]',
  video_recipe_references TEXT NOT NULL DEFAULT '[]',
  extra_reference_images TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  video_url TEXT,
  current_image_generation_id INTEGER,
  current_video_generation_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, storyboard_number)
);
CREATE TABLE IF NOT EXISTS storyboard_project_assets (
  storyboard_id INTEGER NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
  project_asset_id INTEGER NOT NULL REFERENCES project_assets(id) ON DELETE CASCADE,
  PRIMARY KEY(storyboard_id, project_asset_id)
);
CREATE TABLE IF NOT EXISTS provider_model_catalog (
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('image', 'video')),
  capabilities TEXT NOT NULL DEFAULT '{}',
  synchronized_at TEXT NOT NULL,
  PRIMARY KEY(provider, model_id, kind)
);
CREATE TABLE IF NOT EXISTS ai_model_presets (
  service_type TEXT PRIMARY KEY CHECK(service_type IN ('image', 'video')),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS async_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT -1,
  message TEXT,
  error TEXT,
  result TEXT,
  resource_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS image_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  project_asset_id INTEGER REFERENCES project_assets(id) ON DELETE SET NULL,
  storyboard_id INTEGER REFERENCES storyboards(id) ON DELETE SET NULL,
  provider TEXT,
  prompt TEXT NOT NULL,
  model TEXT,
  size TEXT,
  aspect_ratio TEXT,
  reference_images TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  source_url TEXT,
  local_path TEXT,
  media_type TEXT,
  file_size INTEGER,
  failure_stage TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  task_id TEXT,
  error_msg TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS video_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  storyboard_id INTEGER REFERENCES storyboards(id) ON DELETE SET NULL,
  provider TEXT,
  prompt TEXT NOT NULL,
  model TEXT,
  duration REAL,
  aspect_ratio TEXT,
  resolution TEXT,
  image_url TEXT,
  first_frame_url TEXT,
  last_frame_url TEXT,
  reference_image_urls TEXT NOT NULL DEFAULT '[]',
  video_url TEXT,
  source_url TEXT,
  local_path TEXT,
  media_type TEXT,
  file_size INTEGER,
  failure_stage TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  task_id TEXT,
  provider_task_id TEXT,
  error_msg TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_episodes_drama ON episodes(drama_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_drama ON project_assets(drama_id, kind);
CREATE INDEX IF NOT EXISTS idx_storyboards_episode ON storyboards(episode_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_project_assets_asset ON storyboard_project_assets(project_asset_id);
CREATE INDEX IF NOT EXISTS idx_image_generations_target ON image_generations(drama_id, project_asset_id, storyboard_id);
CREATE INDEX IF NOT EXISTS idx_video_generations_target ON video_generations(drama_id, episode_id, storyboard_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON async_tasks(status);
`;

export function initializeDatabase(database: SQLiteDatabase): void {
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
}
