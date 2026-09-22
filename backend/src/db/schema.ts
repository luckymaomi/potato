import type { SQLiteDatabase } from '../types/core';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dramas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
  story_hook TEXT NOT NULL DEFAULT '', worldview TEXT NOT NULL DEFAULT '', storyline TEXT NOT NULL DEFAULT '', tone TEXT NOT NULL DEFAULT '', reference_setting TEXT NOT NULL DEFAULT '',
  genre TEXT, style TEXT NOT NULL DEFAULT 'realistic', status TEXT NOT NULL DEFAULT 'draft', thumbnail TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_number INTEGER NOT NULL, title TEXT NOT NULL, duration REAL NOT NULL DEFAULT 0,
  script_content TEXT, description TEXT, episode_goal TEXT NOT NULL DEFAULT '', conflict TEXT NOT NULL DEFAULT '', turning_point TEXT NOT NULL DEFAULT '', ending_hook TEXT NOT NULL DEFAULT '', scene_notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(drama_id, episode_number)
);
CREATE TABLE IF NOT EXISTS project_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('character', 'scene', 'prop')), name TEXT NOT NULL,
  text_profile TEXT NOT NULL DEFAULT '{}', output_type TEXT NOT NULL, output_prompt TEXT NOT NULL DEFAULT '', input_reference_images TEXT NOT NULL DEFAULT '[]', image_url TEXT, local_path TEXT, current_image_generation_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT, episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE, panel_number INTEGER NOT NULL,
  title TEXT, description TEXT, action TEXT, expression TEXT, framing TEXT, viewpoint TEXT, composition TEXT, lighting TEXT, mood TEXT,
  image_prompt TEXT, image_recipe_prompt TEXT NOT NULL DEFAULT '', image_recipe_references TEXT NOT NULL DEFAULT '[]', extra_reference_images TEXT NOT NULL DEFAULT '[]', image_needs_review INTEGER NOT NULL DEFAULT 0, recipe_needs_reassembly INTEGER NOT NULL DEFAULT 0,
  image_url TEXT, current_image_generation_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(episode_id, panel_number)
);
CREATE TABLE IF NOT EXISTS panel_project_assets (panel_id INTEGER NOT NULL REFERENCES panels(id) ON DELETE CASCADE, project_asset_id INTEGER NOT NULL REFERENCES project_assets(id) ON DELETE CASCADE, PRIMARY KEY(panel_id, project_asset_id));
CREATE TABLE IF NOT EXISTS panel_captions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, panel_id INTEGER NOT NULL REFERENCES panels(id) ON DELETE CASCADE, text TEXT NOT NULL, bubble_type TEXT NOT NULL DEFAULT 'speech', x REAL NOT NULL DEFAULT 0.5, y REAL NOT NULL DEFAULT 0.5, scale REAL NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS panel_audio (
  id INTEGER PRIMARY KEY AUTOINCREMENT, panel_id INTEGER NOT NULL REFERENCES panels(id) ON DELETE CASCADE, role TEXT, style TEXT, text TEXT NOT NULL, source_url TEXT, local_path TEXT, public_url TEXT, media_type TEXT, status TEXT NOT NULL DEFAULT 'pending', error_msg TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS page_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE, template TEXT NOT NULL CHECK(template IN ('single', 'grid_2x2', 'vertical_4')), panel_ids TEXT NOT NULL DEFAULT '[]', output_url TEXT, local_path TEXT, width INTEGER, height INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_model_catalog (provider TEXT NOT NULL, model_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('image', 'video')), capabilities TEXT NOT NULL DEFAULT '{}', synchronized_at TEXT NOT NULL, PRIMARY KEY(provider, model_id, kind));
CREATE TABLE IF NOT EXISTS ai_model_presets (service_type TEXT PRIMARY KEY CHECK(service_type IN ('image')), provider TEXT NOT NULL, model_id TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tts_configs (id INTEGER PRIMARY KEY CHECK(id = 1), provider TEXT NOT NULL, base_url TEXT NOT NULL, api_key TEXT NOT NULL, role TEXT, style TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS async_tasks (id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT -1, message TEXT, error TEXT, result TEXT, resource_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);
CREATE TABLE IF NOT EXISTS image_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, drama_id INTEGER NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, project_asset_id INTEGER REFERENCES project_assets(id) ON DELETE SET NULL, panel_id INTEGER REFERENCES panels(id) ON DELETE SET NULL, provider TEXT, prompt TEXT NOT NULL, model TEXT, size TEXT, aspect_ratio TEXT, reference_images TEXT NOT NULL DEFAULT '[]', image_url TEXT, source_url TEXT, local_path TEXT, media_type TEXT, file_size INTEGER, failure_stage TEXT, status TEXT NOT NULL DEFAULT 'pending', task_id TEXT, error_msg TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_episodes_drama ON episodes(drama_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_drama ON project_assets(drama_id, kind);
CREATE INDEX IF NOT EXISTS idx_panels_episode ON panels(episode_id);
CREATE INDEX IF NOT EXISTS idx_panel_assets_asset ON panel_project_assets(project_asset_id);
CREATE INDEX IF NOT EXISTS idx_panel_captions_panel ON panel_captions(panel_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_panel_audio_panel ON panel_audio(panel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_page_layouts_episode ON page_layouts(episode_id, created_at);
CREATE INDEX IF NOT EXISTS idx_image_generations_target ON image_generations(drama_id, project_asset_id, panel_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON async_tasks(status);
`;

export function initializeDatabase(database: SQLiteDatabase): void {
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
}
