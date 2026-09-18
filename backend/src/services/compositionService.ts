import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { TaskService } from './taskService';
import { NotFoundError } from '../errors';

export class CompositionService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly config: AppConfig,
    private readonly tasks: TaskService,
    private readonly log?: Logger,
  ) {}

  finalize(episodeId: number, videoUrls: string[]): string {
    const episode = this.db.prepare('SELECT id, drama_id FROM episodes WHERE id = ?').get(episodeId) as { id: number; drama_id: number } | undefined;
    if (!episode) throw new NotFoundError('集数不存在');
    const now = new Date().toISOString();
    const inserted = this.db.prepare(`
      INSERT INTO video_generations (
        drama_id, episode_id, provider, prompt, model, reference_image_urls, status, created_at, updated_at
      ) VALUES (?, ?, 'local-composition', '按分镜顺序合成本集', 'ffmpeg-concat-copy', '[]', 'pending', ?, ?)
    `).run(episode.drama_id, episode.id, now, now);
    const generationId = Number(inserted.lastInsertRowid);
    this.log?.audit?.('composition.generation.created', { episodeId, projectId: episode.drama_id, generationId });
    const taskId = this.tasks.run('episode_finalize', String(generationId), async (reporter) => {
      const root = storageRoot(this.config);
      const relativePath = path.posix.join('projects', String(episode.drama_id), 'videos', `${generationId}.mp4`);
      const output = path.resolve(root, ...relativePath.split('/'));
      const manifest = `${output}.concat.txt`;
      try {
        this.mark(generationId, 'processing');
        if (!videoUrls.length) throw new Error('没有显式连入可合成的视频');
        reporter.stage('正在准备视频片段');
        await fs.promises.mkdir(path.dirname(output), { recursive: true });
        await fs.promises.writeFile(manifest, videoUrls.map((url) => `file '${escapeConcatPath(resolveVideoSource(url, root))}'`).join('\n'), { encoding: 'utf8', flag: 'wx' });
        reporter.stage('正在合成整集');
        await runFfmpeg(manifest, output, reporter.signal);
        reporter.throwIfCancelled();
        const stat = await fs.promises.stat(output);
        if (!stat.isFile() || stat.size === 0) throw new Error('FFmpeg 没有生成有效成片文件');
        const videoUrl = `/static/${relativePath}`;
        const completedAt = new Date().toISOString();
        const commit = this.db.transaction(() => {
          this.db.prepare(`
            UPDATE video_generations SET status = 'completed', video_url = ?, local_path = ?, media_type = 'video/mp4',
              file_size = ?, failure_stage = NULL, error_msg = NULL, updated_at = ?, completed_at = ? WHERE id = ?
          `).run(videoUrl, relativePath, stat.size, completedAt, completedAt, generationId);
          this.db.prepare(`UPDATE episodes SET video_url = ?, current_video_generation_id = ?, status = 'completed', updated_at = ? WHERE id = ?`)
            .run(videoUrl, generationId, completedAt, episodeId);
        });
        commit();
        this.log?.audit?.('composition.completed', {
          episodeId,
          projectId: episode.drama_id,
          generationId,
          videoUrl,
          localPath: relativePath,
          fileSize: stat.size,
        });
        return { video_url: videoUrl, local_path: relativePath, episode_id: episodeId, generation_id: generationId };
      } catch (error) {
        await fs.promises.rm(output, { force: true }).catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        this.db.prepare(`UPDATE video_generations SET status = ?, failure_stage = ?, error_msg = ?, updated_at = ? WHERE id = ?`)
          .run(reporter.signal.aborted ? 'cancelled' : 'failed', reporter.signal.aborted ? null : 'composition', message, new Date().toISOString(), generationId);
        this.log?.audit?.('composition.failed', { episodeId, projectId: episode.drama_id, generationId, error });
        throw error;
      } finally {
        await fs.promises.rm(manifest, { force: true }).catch(() => undefined);
      }
    });
    this.db.prepare('UPDATE video_generations SET task_id = ?, updated_at = ? WHERE id = ?').run(taskId, new Date().toISOString(), generationId);
    return taskId;
  }

  private mark(generationId: number, status: string): void {
    this.db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), generationId);
  }
}

function storageRoot(config: AppConfig): string {
  const configured = config.storage?.local_path ?? './data/storage';
  return path.resolve(configured);
}

function resolveVideoSource(source: string, root: string): string {
  if (!source.startsWith('/static/')) throw new Error('分镜视频不是已归档的本地文件，不能参与合成');
  const relativePath = source.slice('/static/'.length).replace(/\\/gu, '/');
  const target = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(path.resolve(root), target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('分镜视频本地路径越界');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('分镜视频本地文件缺失，不能参与合成');
  return target;
}

function escapeConcatPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/'/gu, "'\\''");
}

async function runFfmpeg(manifest: string, output: string, signal: AbortSignal): Promise<void> {
  const bundled = path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe');
  const executable = process.env.FFMPEG_PATH || (fs.existsSync(bundled) ? bundled : 'ffmpeg');
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('整集合成已取消'));
      return;
    }
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
    const abort = () => {
      child.kill();
      reject(signal.reason ?? new Error('整集合成已取消'));
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { errorOutput += chunk; });
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort);
      reject(new Error(`无法启动 FFmpeg：${error.message}`));
    });
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg 合成失败（退出码 ${String(code)}）：${errorOutput.slice(-800)}`));
    });
  });
}
