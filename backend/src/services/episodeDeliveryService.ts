import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { NotFoundError, ValidationError } from '../errors';
import type { AppConfig, SQLiteDatabase } from '../types/core';

interface EpisodeMedia {
  url: string;
  filePath: string;
}

interface ShotRow {
  id: number;
  storyboard_number: number;
  title: string | null;
  description: string | null;
  dialogue: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  image_recipe_prompt: string;
  video_recipe_prompt: string;
  image_url: string | null;
  image_local_path: string | null;
  image_status: string | null;
  video_url: string | null;
  video_local_path: string | null;
  video_status: string | null;
  image_needs_review: number;
  video_needs_review: number;
  recipe_needs_reassembly: number;
  current_video_generation_id: number | null;
}

interface AssetRow {
  id: number;
  kind: string;
  name: string;
  image_url: string | null;
  local_path: string | null;
  status: string | null;
}

export class EpisodeDeliveryService {
  private readonly root: string;

  constructor(private readonly db: SQLiteDatabase, config: AppConfig) {
    this.root = path.resolve(config.storage?.local_path ?? './data/storage');
  }

  episodeVideo(projectId: number, episodeId: number): EpisodeMedia {
    const row = this.db.prepare(`
      SELECT e.video_url, e.current_video_generation_id, v.status, v.local_path, v.video_url AS generation_url
      FROM episodes e LEFT JOIN video_generations v ON v.id = e.current_video_generation_id
      WHERE e.id = ? AND e.drama_id = ?
    `).get(episodeId, projectId) as {
      video_url: string | null;
      current_video_generation_id: number | null;
      status: string | null;
      local_path: string | null;
      generation_url: string | null;
    } | undefined;
    if (!row) throw new NotFoundError('剧集不存在');
    if (!row.current_video_generation_id || row.status !== 'completed' || !row.local_path || !row.generation_url) {
      throw new ValidationError('本集还没有可下载的已完成成片');
    }
    return { url: row.generation_url, filePath: this.localFile(row.local_path, '成片') };
  }

  async exportShots(projectId: number, episodeId: number, requestedShotIds: number[], targetPath: string): Promise<{ shotCount: number; relativePath: string }> {
    const episode = this.db.prepare(`SELECT e.id, e.title, d.title AS project_title FROM episodes e JOIN dramas d ON d.id = e.drama_id WHERE e.id = ? AND e.drama_id = ?`)
      .get(episodeId, projectId) as { id: number; title: string; project_title: string } | undefined;
    if (!episode) throw new NotFoundError('剧集不存在');
    const allShots = this.db.prepare(`
      SELECT s.*, ig.local_path AS image_local_path, ig.status AS image_status,
        vg.local_path AS video_local_path, vg.status AS video_status
      FROM storyboards s
      LEFT JOIN image_generations ig ON ig.id = s.current_image_generation_id
      LEFT JOIN video_generations vg ON vg.id = s.current_video_generation_id
      WHERE s.episode_id = ? ORDER BY s.storyboard_number
    `).all(episodeId) as ShotRow[];
    if (!allShots.length) throw new ValidationError('本集没有可导出的分镜');
    const selected = requestedShotIds.length
      ? allShots.filter((shot) => requestedShotIds.includes(shot.id))
      : allShots;
    const missingSelection = requestedShotIds.filter((id) => !allShots.some((shot) => shot.id === id));
    if (missingSelection.length) throw new NotFoundError(`分镜不存在：${missingSelection.join('、')}`);
    if (!selected.length) throw new ValidationError('请选择至少一个分镜');
    selected.forEach((shot) => {
      if (!shot.current_video_generation_id || shot.video_status !== 'completed' || !shot.video_local_path || !shot.video_url) {
        throw new ValidationError(`镜头${shot.storyboard_number}缺少当前已完成视频，无法导出镜头包`);
      }
      this.localFile(shot.video_local_path, `镜头${shot.storyboard_number}视频`);
    });
    const assetIdsByShot = new Map<number, number[]>();
    for (const shot of selected) {
      const rows = this.db.prepare('SELECT project_asset_id FROM storyboard_project_assets WHERE storyboard_id = ? ORDER BY project_asset_id')
        .all(shot.id) as Array<{ project_asset_id: number }>;
      assetIdsByShot.set(shot.id, rows.map((row) => row.project_asset_id));
    }

    const packageName = `${safeName(episode.project_title)}_${safeName(episode.title)}_镜头包`;
    const archive = archiver('zip', { store: true });
    const output = fs.createWriteStream(targetPath);
    const closed = new Promise<void>((resolve, reject) => {
      output.once('close', () => resolve());
      output.once('error', reject);
      archive.once('error', reject);
    });
    archive.pipe(output);
    archive.append(shotsCsv(selected, assetIdsByShot), { name: `${packageName}/shots.csv` });
    for (const shot of selected) {
      const folder = `${packageName}/${String(shot.storyboard_number).padStart(2, '0')}_${safeName(shot.title || `镜头${shot.storyboard_number}`)}`;
      archive.file(this.absolutePath(shot.video_local_path as string), { name: `${folder}/video.mp4` });
      const missing: string[] = [];
      if (shot.image_local_path && shot.image_status === 'completed' && this.fileExists(shot.image_local_path)) {
        archive.file(this.absolutePath(shot.image_local_path), { name: `${folder}/storyboard${extension(shot.image_local_path, '.jpg')}` });
      } else {
        missing.push('storyboard');
      }
      const assets = this.db.prepare(`
        SELECT a.id, a.kind, a.name, a.image_url, a.local_path, ig.status
        FROM storyboard_project_assets spa
        JOIN project_assets a ON a.id = spa.project_asset_id
        LEFT JOIN image_generations ig ON ig.id = a.current_image_generation_id
        WHERE spa.storyboard_id = ? ORDER BY a.id
      `).all(shot.id) as AssetRow[];
      for (const asset of assets) {
        const assetName = `${asset.kind}_${safeName(asset.name)}`;
        if (asset.local_path && asset.status === 'completed' && this.fileExists(asset.local_path)) {
          archive.file(this.absolutePath(asset.local_path), { name: `${folder}/assets/${assetName}${extension(asset.local_path, '.jpg')}` });
        } else {
          missing.push(`asset:${asset.id}`);
        }
      }
      archive.append(shotMeta(shot, assets, missing), { name: `${folder}/meta.txt` });
    }
    await archive.finalize();
    await closed;
    return { shotCount: selected.length, relativePath: targetPath };
  }

  private fileExists(relativePath: string): boolean {
    try { return fs.statSync(this.absolutePath(relativePath)).isFile(); } catch { return false; }
  }

  private localFile(relativePath: string, label: string): string {
    const target = this.absolutePath(relativePath);
    if (!this.fileExists(relativePath)) throw new ValidationError(`${label}本地文件缺失，无法导出`);
    return target;
  }

  private absolutePath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/gu, '/').replace(/^\/+/u, '');
    const target = path.resolve(this.root, ...normalized.split('/'));
    const relative = path.relative(this.root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new ValidationError('媒体路径越界，无法导出');
    return target;
  }
}

function safeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 80) || '未命名';
}

function extension(value: string, fallback: string): string {
  const ext = path.extname(value).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/u.test(ext) ? ext : fallback;
}

function csv(value: string | null | undefined): string {
  const text = value ?? '';
  return `"${text.replace(/"/gu, '""')}"`;
}

function shotsCsv(shots: ShotRow[], assetIdsByShot: Map<number, number[]>): string {
  const lines = ['序号,标题,对白,剧情说明,图片提示词,视频提示词,资产ID,图片待复核,视频待复核,配方待重装'];
  for (const shot of shots) lines.push([
    String(shot.storyboard_number), csv(shot.title), csv(shot.dialogue), csv(shot.description),
    csv(shot.image_recipe_prompt), csv(shot.video_recipe_prompt), csv((assetIdsByShot.get(shot.id) ?? []).join('|')), shot.image_needs_review ? 'needs_review' : '', shot.video_needs_review ? 'needs_review' : '', shot.recipe_needs_reassembly ? 'needs_review' : '',
  ].join(','));
  return `${lines.join('\n')}\n`;
}

function shotMeta(shot: ShotRow, assets: AssetRow[], missing: string[]): string {
  return [
    `镜头：${shot.storyboard_number} ${shot.title ?? ''}`,
    `剧情说明：${shot.description ?? ''}`,
    `对白：${shot.dialogue ?? ''}`,
    `图片提示词：${shot.image_recipe_prompt}`,
    `视频提示词：${shot.video_recipe_prompt}`,
    `出场资产：${assets.length ? assets.map((asset) => `${asset.id} ${asset.kind} ${asset.name}`).join('；') : '无'}`,
    `状态：${missing.length ? `needs_review（缺少${missing.join('、')}）` : 'ready'}`,
  ].join('\n') + '\n';
}
