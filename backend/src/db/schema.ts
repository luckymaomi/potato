import type { SQLiteDatabase } from '../types/core';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dramas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
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
  video_url TEXT,
  current_video_generation_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(drama_id, episode_number)
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  appearance TEXT,
  image_url TEXT,
  local_path TEXT,
  current_image_generation_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  prompt TEXT,
  image_url TEXT,
  local_path TEXT,
  current_image_generation_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  image_url TEXT,
  local_path TEXT,
  current_image_generation_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_library_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('character', 'scene', 'prop')),
  name TEXT NOT NULL,
  description TEXT,
  appearance TEXT,
  prompt TEXT,
  visual_description TEXT,
  image_url TEXT,
  local_path TEXT,
  current_image_generation_id INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  library_item_id INTEGER REFERENCES asset_library_items(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK(kind IN ('character', 'scene', 'prop')),
  name TEXT NOT NULL,
  description TEXT,
  appearance TEXT,
  prompt TEXT,
  visual_description TEXT,
  image_url TEXT,
  local_path TEXT,
  current_image_generation_id INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(drama_id, library_item_id)
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
  negative_prompt TEXT,
  video_prompt TEXT,
  image_url TEXT,
  video_url TEXT,
  current_image_generation_id INTEGER,
  current_video_generation_id INTEGER,
  grid_rows INTEGER NOT NULL DEFAULT 1,
  grid_columns INTEGER NOT NULL DEFAULT 1,
  duration REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, storyboard_number)
);
CREATE TABLE IF NOT EXISTS storyboard_characters (
  storyboard_id INTEGER NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY(storyboard_id, character_id)
);
CREATE TABLE IF NOT EXISTS storyboard_scenes (
  storyboard_id INTEGER NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
  scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  PRIMARY KEY(storyboard_id, scene_id)
);
CREATE TABLE IF NOT EXISTS storyboard_props (
  storyboard_id INTEGER NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
  prop_id INTEGER NOT NULL REFERENCES props(id) ON DELETE CASCADE,
  PRIMARY KEY(storyboard_id, prop_id)
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
  kind TEXT NOT NULL CHECK(kind IN ('text', 'image', 'video')),
  capabilities TEXT NOT NULL DEFAULT '{}',
  synchronized_at TEXT NOT NULL,
  PRIMARY KEY(provider, model_id, kind)
);
CREATE TABLE IF NOT EXISTS ai_model_presets (
  service_type TEXT PRIMARY KEY CHECK(service_type IN ('text', 'image', 'video')),
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
  drama_id INTEGER REFERENCES dramas(id) ON DELETE CASCADE,
  library_item_id INTEGER REFERENCES asset_library_items(id) ON DELETE SET NULL,
  project_asset_id INTEGER REFERENCES project_assets(id) ON DELETE SET NULL,
  storyboard_id INTEGER REFERENCES storyboards(id) ON DELETE SET NULL,
  scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  prop_id INTEGER REFERENCES props(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_storyboards_episode ON storyboards(episode_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character ON storyboard_characters(character_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_scenes_scene ON storyboard_scenes(scene_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_props_prop ON storyboard_props(prop_id);
CREATE INDEX IF NOT EXISTS idx_image_generations_target ON image_generations(drama_id, character_id, scene_id, prop_id, storyboard_id);
CREATE INDEX IF NOT EXISTS idx_video_generations_target ON video_generations(drama_id, episode_id, storyboard_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON async_tasks(status);
`;

export function initializeDatabase(database: SQLiteDatabase): void {
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
}
