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
  canvas_revision INTEGER NOT NULL DEFAULT 0,
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  location TEXT NOT NULL,
  prompt TEXT,
  image_url TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  image_url TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS storyboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  storyboard_number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  action TEXT,
  dialogue TEXT,
  image_prompt TEXT,
  video_prompt TEXT,
  image_url TEXT,
  video_url TEXT,
  duration REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, storyboard_number)
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
CREATE TABLE IF NOT EXISTS async_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
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
  local_path TEXT,
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
  local_path TEXT,
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
CREATE INDEX IF NOT EXISTS idx_tasks_status ON async_tasks(status);
`;

export function initializeDatabase(database: SQLiteDatabase): void {
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
}
