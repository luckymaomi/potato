import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { CompositionService } from '../src/services/compositionService';
import { TaskService } from '../src/services/taskService';
import type { AppConfig } from '../src/types/core';

test('整集合成按分镜顺序生成本地 MP4', async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-ai-drama-composition-'));
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const now = new Date().toISOString();
    const drama = db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('合成测试', '{}', ?, ?)
    `).run(now, now);
    const episode = db.prepare(`
      INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第一集', ?, ?)
    `).run(Number(drama.lastInsertRowid), now, now);
    const ffmpeg = path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe');
    assert.equal(fs.existsSync(ffmpeg), true, '仓库内必须包含 FFmpeg');
    const videoUrls: string[] = [];
    for (const [index, color] of ['black', 'white'].entries()) {
      const filename = `segment-${index + 1}.mp4`;
      const output = path.join(storage, filename);
      const generated = spawnSync(ffmpeg, [
        '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:d=0.2`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', output,
      ], { windowsHide: true, encoding: 'utf8' });
      assert.equal(generated.status, 0, generated.stderr);
      videoUrls.push(`/static/${filename}`);
    }
    const config: AppConfig = {
      app: { name: 'test', version: '1' },
      server: {},
      database: { path: ':memory:' },
      storage: { local_path: storage },
    };
    const tasks = new TaskService(db);
    const service = new CompositionService(db, config, tasks);
    const taskId = service.finalize(Number(episode.lastInsertRowid), videoUrls);
    const task = await waitForTask(tasks, taskId);
    assert.equal(task.status, 'completed', task.error ?? '合成任务失败');
    const videoUrl = String(task.result?.video_url ?? '');
    assert.match(videoUrl, /^\/static\/projects\/\d+\/videos\/\d+\.mp4$/u);
    assert.equal(fs.existsSync(path.join(storage, videoUrl.slice('/static/'.length))), true);
    const generation = db.prepare('SELECT * FROM video_generations WHERE episode_id = ?').get(Number(episode.lastInsertRowid)) as {
      id: number; status: string; video_url: string; local_path: string; provider: string;
    };
    assert.equal(generation.status, 'completed');
    assert.equal(generation.provider, 'local-composition');
    assert.equal(generation.video_url, videoUrl);
    assert.equal(generation.local_path, videoUrl.slice('/static/'.length));
    const current = db.prepare('SELECT current_video_generation_id FROM episodes WHERE id = ?').get(Number(episode.lastInsertRowid)) as { current_video_generation_id: number };
    assert.equal(current.current_video_generation_id, generation.id);
  } finally {
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test('整集合成拒绝用供应商 HTTP 地址绕过本地归档', async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-ai-drama-remote-composition-'));
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const now = new Date().toISOString();
    const drama = db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('远程合成测试', '{}', ?, ?)
    `).run(now, now);
    const episode = db.prepare(`
      INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第一集', ?, ?)
    `).run(Number(drama.lastInsertRowid), now, now);
    const config: AppConfig = {
      app: { name: 'test', version: '1' },
      server: {},
      database: { path: ':memory:' },
      storage: { local_path: storage },
    };
    const tasks = new TaskService(db);
    const task = await waitForTask(tasks, new CompositionService(db, config, tasks).finalize(Number(episode.lastInsertRowid), ['https://provider.invalid/segment.mp4']));
    assert.equal(task.status, 'failed');
    assert.match(task.error ?? '', /不是已归档的本地文件/u);
    const generation = db.prepare('SELECT status, failure_stage FROM video_generations WHERE episode_id = ?')
      .get(Number(episode.lastInsertRowid)) as { status: string; failure_stage: string };
    assert.deepEqual(generation, { status: 'failed', failure_stage: 'composition' });
  } finally {
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

async function waitForTask(tasks: TaskService, id: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = tasks.get(id);
    if (task && ['completed', 'failed'].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('合成任务超时');
}
