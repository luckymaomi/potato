import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppConfig, SQLiteDatabase } from '../types/core';
import { TaskService } from './taskService';
import { NotFoundError } from '../errors';

interface StoryboardVideoRow { video_url: string }

export class CompositionService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly config: AppConfig,
    private readonly tasks: TaskService,
  ) {}

  finalize(episodeId: number): string {
    const episode = this.db.prepare('SELECT id FROM episodes WHERE id = ?').get(episodeId) as { id: number } | undefined;
    if (!episode) throw new NotFoundError('集数不存在');
    return this.tasks.run('episode_finalize', String(episodeId), async (reporter) => {
      const rows = this.db.prepare(`
        SELECT video_url FROM storyboards WHERE episode_id = ? AND video_url IS NOT NULL AND video_url <> '' ORDER BY storyboard_number
      `).all(episodeId) as StoryboardVideoRow[];
      if (!rows.length) throw new Error('当前集没有可合成的分镜视频');
      reporter.progress(10, '正在准备视频片段');
      const root = storageRoot(this.config);
      const outputDir = path.join(root, 'exports');
      fs.mkdirSync(outputDir, { recursive: true });
      const stem = `episode-${episodeId}-${randomUUID()}`;
      const manifest = path.join(outputDir, `${stem}.txt`);
      const output = path.join(outputDir, `${stem}.mp4`);
      fs.writeFileSync(manifest, rows.map((row) => `file '${escapeConcatPath(resolveVideoSource(row.video_url, root))}'`).join('\n'), 'utf8');
      try {
        reporter.progress(25, '正在合成整集');
        await runFfmpeg(manifest, output);
      } finally {
        fs.rmSync(manifest, { force: true });
      }
      const videoUrl = `/static/exports/${path.basename(output)}`;
      this.db.prepare(`UPDATE episodes SET video_url = ?, status = 'completed', updated_at = ? WHERE id = ?`)
        .run(videoUrl, new Date().toISOString(), episodeId);
      reporter.progress(100, '整集合成完成');
      return { video_url: videoUrl, episode_id: episodeId };
    });
  }
}

function storageRoot(config: AppConfig): string {
  const configured = config.storage?.local_path ?? './data/storage';
  return path.resolve(configured);
}

function resolveVideoSource(source: string, root: string): string {
  if (source.startsWith('/static/')) return path.join(root, source.slice('/static/'.length));
  return source;
}

function escapeConcatPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/'/gu, "'\\''");
}

async function runFfmpeg(manifest: string, output: string): Promise<void> {
  const bundled = path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe');
  const executable = process.env.FFMPEG_PATH || (fs.existsSync(bundled) ? bundled : 'ffmpeg');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [
      '-y',
      '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,data',
      '-f', 'concat',
      '-safe', '0',
      '-i', manifest,
      '-c', 'copy',
      output,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorOutput = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { errorOutput += chunk; });
    child.once('error', (error) => reject(new Error(`无法启动 FFmpeg：${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg 合成失败（退出码 ${String(code)}）：${errorOutput.slice(-800)}`));
    });
  });
}
