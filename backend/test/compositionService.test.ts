import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/db/migrate';
import { CompositionService } from '../src/services/compositionService';
import { TaskService } from '../src/services/taskService';
import type { AppConfig } from '../src/types/core';

test('整集合成按分镜顺序生成本地 MP4', async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-video-composition-'));
  const db = new Database(':memory:');
  try {
    migrate(db);
    const now = new Date().toISOString();
    const drama = db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('合成测试', '{}', ?, ?)
    `).run(now, now);
    const episode = db.prepare(`
      INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第一集', ?, ?)
    `).run(Number(drama.lastInsertRowid), now, now);
    const ffmpeg = path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe');
    assert.equal(fs.existsSync(ffmpeg), true, '仓库内必须包含 FFmpeg');
    for (const [index, color] of ['black', 'white'].entries()) {
      const filename = `segment-${index + 1}.mp4`;
      const output = path.join(storage, filename);
      const generated = spawnSync(ffmpeg, [
        '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:d=0.2`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', output,
      ], { windowsHide: true, encoding: 'utf8' });
      assert.equal(generated.status, 0, generated.stderr);
      db.prepare(`
        INSERT INTO storyboards (episode_id, storyboard_number, video_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(Number(episode.lastInsertRowid), index + 1, `/static/${filename}`, now, now);
    }
    const config: AppConfig = {
      app: { name: 'test', version: '1' },
      server: {},
      database: { path: ':memory:' },
      storage: { local_path: storage },
    };
    const tasks = new TaskService(db);
    const service = new CompositionService(db, config, tasks);
    const taskId = service.finalize(Number(episode.lastInsertRowid));
    const task = await waitForTask(tasks, taskId);
    assert.equal(task.status, 'completed', task.error ?? '合成任务失败');
    const videoUrl = String(task.result?.video_url ?? '');
    assert.match(videoUrl, /^\/static\/exports\/.+\.mp4$/u);
    assert.equal(fs.existsSync(path.join(storage, videoUrl.slice('/static/'.length))), true);
  } finally {
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test('整集合成允许读取供应商返回的 HTTP 视频地址', async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-video-remote-composition-'));
  const db = new Database(':memory:');
  const segment = path.join(storage, 'remote-segment.mp4');
  const ffmpeg = path.join(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe');
  const generated = spawnSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:d=0.2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', segment,
  ], { windowsHide: true, encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(segment).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    migrate(db);
    const now = new Date().toISOString();
    const drama = db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('远程合成测试', '{}', ?, ?)
    `).run(now, now);
    const episode = db.prepare(`
      INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第一集', ?, ?)
    `).run(Number(drama.lastInsertRowid), now, now);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    db.prepare(`
      INSERT INTO storyboards (episode_id, storyboard_number, video_url, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?)
    `).run(Number(episode.lastInsertRowid), `http://127.0.0.1:${address.port}/segment.mp4`, now, now);
    const config: AppConfig = {
      app: { name: 'test', version: '1' },
      server: {},
      database: { path: ':memory:' },
      storage: { local_path: storage },
    };
    const tasks = new TaskService(db);
    const task = await waitForTask(tasks, new CompositionService(db, config, tasks).finalize(Number(episode.lastInsertRowid)));
    assert.equal(task.status, 'completed', task.error ?? '远程视频合成失败');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
