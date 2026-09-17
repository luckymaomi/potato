import AdmZip from 'adm-zip';
import type { SQLiteDatabase } from '../types/core';
import { asRecord, readNumber } from '../types/core';
import type { Drama } from '../types/domain';
import { ProjectService } from './projectService';
import { ValidationError } from '../errors';

export class ProjectArchiveService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly projects: ProjectService,
  ) {}

  export(projectId: number): Buffer {
    const project = this.projects.require(projectId);
    const zip = new AdmZip();
    zip.addFile('project.json', Buffer.from(JSON.stringify({ version: 1, project }, null, 2), 'utf8'));
    return zip.toBuffer();
  }

  import(buffer: Buffer): Drama {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('project.json');
    if (!entry) throw new ValidationError('归档中缺少 project.json');
    const payload = asRecord(JSON.parse(entry.getData().toString('utf8')) as unknown);
    const source = asRecord(payload?.project);
    if (!source) throw new ValidationError('项目归档格式无效');
    return this.db.transaction(() => {
      const created = this.projects.create(source);
      const episodes = Array.isArray(source.episodes) ? source.episodes : [];
      this.projects.saveEpisodes(created.id, episodes);
      this.importEntities(created.id, 'characters', source.characters);
      this.importEntities(created.id, 'scenes', source.scenes);
      this.importEntities(created.id, 'props', source.props);
      const newEpisodes = this.db.prepare('SELECT id, episode_number FROM episodes WHERE drama_id = ?').all(created.id) as Array<{ id: number; episode_number: number }>;
      for (const rawEpisode of episodes) {
        const episode = asRecord(rawEpisode);
        const number = readNumber(episode?.episode_number);
        const newEpisode = newEpisodes.find((item) => item.episode_number === number);
        if (!newEpisode || !Array.isArray(episode?.storyboards)) continue;
        for (const rawStoryboard of episode.storyboards) {
          const item = asRecord(rawStoryboard) ?? {};
          const now = new Date().toISOString();
          this.db.prepare(`
            INSERT INTO storyboards (
              episode_id, storyboard_number, title, description, action, dialogue,
              image_prompt, video_prompt, image_url, video_url, duration, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newEpisode.id,
            readNumber(item.storyboard_number) ?? 1,
            textOrNull(item.title),
            textOrNull(item.description),
            textOrNull(item.action),
            textOrNull(item.dialogue),
            textOrNull(item.image_prompt),
            textOrNull(item.video_prompt),
            textOrNull(item.image_url),
            textOrNull(item.video_url),
            readNumber(item.duration) ?? null,
            now,
            now,
          );
        }
      }
      return this.projects.require(created.id);
    })();
  }

  private importEntities(dramaId: number, table: 'characters' | 'scenes' | 'props', input: unknown): void {
    if (!Array.isArray(input)) return;
    const now = new Date().toISOString();
    for (const raw of input) {
      const item = asRecord(raw) ?? {};
      if (table === 'characters') {
        this.db.prepare(`INSERT INTO characters (drama_id, name, description, appearance, image_url, local_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(dramaId, String(item.name ?? '未命名角色'), textOrNull(item.description), textOrNull(item.appearance), textOrNull(item.image_url), textOrNull(item.local_path), now, now);
      } else if (table === 'scenes') {
        this.db.prepare(`INSERT INTO scenes (drama_id, location, prompt, image_url, local_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(dramaId, String(item.location ?? '未命名场景'), textOrNull(item.prompt), textOrNull(item.image_url), textOrNull(item.local_path), now, now);
      } else {
        this.db.prepare(`INSERT INTO props (drama_id, name, description, prompt, image_url, local_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(dramaId, String(item.name ?? '未命名道具'), textOrNull(item.description), textOrNull(item.prompt), textOrNull(item.image_url), textOrNull(item.local_path), now, now);
      }
    }
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
