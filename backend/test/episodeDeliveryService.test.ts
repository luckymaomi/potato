import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { projectRoutes } from '../src/routes/projectRoutes';
import { EpisodeDeliveryService } from '../src/services/episodeDeliveryService';
import type { AppConfig } from '../src/types/core';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const MP4 = Buffer.from('000000186674797069736f6d00000200', 'hex');

function fixture() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-delivery-'));
  const config: AppConfig = {
    app: { name: 'test', version: '1' }, server: {}, database: { path: ':memory:' },
    storage: { local_path: root, base_url: 'http://localhost:5679/static' }, ai: { providers: {} },
  };
  db.prepare(`INSERT INTO dramas (title, created_at, updated_at) VALUES ('交付测试', datetime('now'), datetime('now'))`).run();
  db.prepare(`INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (1, 1, '第一集', datetime('now'), datetime('now'))`).run();
  return { db, root, config, service: new EpisodeDeliveryService(db, config) };
}

function write(root: string, relative: string, content: Buffer): string {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return relative.replaceAll('\\', '/');
}

function addShot(db: Database.Database, root: string, number: number, withVideo = true) {
  const videoPath = withVideo ? write(root, `projects/1/videos/shot-${number}.mp4`, MP4) : null;
  const imagePath = write(root, `projects/1/images/shot-${number}.png`, PNG);
  const assetPath = write(root, `projects/1/assets/asset-${number}.png`, PNG);
  const image = db.prepare(`INSERT INTO image_generations (drama_id, storyboard_id, prompt, status, image_url, local_path, media_type, created_at, updated_at, completed_at) VALUES (1, ?, '历史提示词', 'completed', ?, ?, 'image/png', datetime('now'), datetime('now'), datetime('now'))`).run(null, `/static/${imagePath}`, imagePath);
  const asset = db.prepare(`INSERT INTO project_assets (drama_id, kind, name, output_type, output_prompt, image_url, local_path, current_image_generation_id, created_at, updated_at) VALUES (1, 'character', ?, 'character-layout-a', '资产提示词', ?, ?, ?, datetime('now'), datetime('now'))`).run(`资产${number}`, `/static/${assetPath}`, assetPath, Number(image.lastInsertRowid));
  const shot = db.prepare(`INSERT INTO storyboards (episode_id, storyboard_number, title, description, image_recipe_prompt, video_recipe_prompt, image_url, current_image_generation_id, video_url, current_video_generation_id, created_at, updated_at) VALUES (1, ?, ?, '剧情', '图片配方', '视频配方', ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(number, `镜头${number}`, `/static/${imagePath}`, Number(image.lastInsertRowid), videoPath ? `/static/${videoPath}` : null, null);
  let videoId: number | null = null;
  if (videoPath) {
    const video = db.prepare(`INSERT INTO video_generations (drama_id, episode_id, storyboard_id, provider, prompt, status, video_url, local_path, media_type, created_at, updated_at, completed_at) VALUES (1, 1, ?, 'local', '历史视频提示词', 'completed', ?, ?, 'video/mp4', datetime('now'), datetime('now'), datetime('now'))`).run(Number(shot.lastInsertRowid), `/static/${videoPath}`, videoPath);
    videoId = Number(video.lastInsertRowid);
    db.prepare('UPDATE storyboards SET current_video_generation_id = ? WHERE id = ?').run(videoId, Number(shot.lastInsertRowid));
  }
  db.prepare('INSERT INTO storyboard_project_assets (storyboard_id, project_asset_id) VALUES (?, ?)').run(Number(shot.lastInsertRowid), Number(asset.lastInsertRowid));
  return { shotId: Number(shot.lastInsertRowid), videoId };
}

test('旧项目 ZIP 路由不再注册，镜头交付服务支持成片与选中镜头包', async () => {
  const { db, root, service } = fixture();
  try {
    const first = addShot(db, root, 1);
    addShot(db, root, 2);
    const episodeVideo = write(root, 'projects/1/videos/episode-1.mp4', MP4);
    const episodeGeneration = db.prepare(`INSERT INTO video_generations (drama_id, episode_id, provider, prompt, status, video_url, local_path, media_type, created_at, updated_at, completed_at) VALUES (1, 1, 'local-composition', '成片', 'completed', ?, ?, 'video/mp4', datetime('now'), datetime('now'), datetime('now'))`).run(`/static/${episodeVideo}`, episodeVideo);
    db.prepare('UPDATE episodes SET video_url = ?, current_video_generation_id = ? WHERE id = 1').run(`/static/${episodeVideo}`, Number(episodeGeneration.lastInsertRowid));

    assert.equal(service.episodeVideo(1, 1).filePath, path.join(root, ...episodeVideo.split('/')));
    const archive = path.join(root, 'shots.zip');
    const result = await service.exportShots(1, 1, [first.shotId], archive);
    assert.equal(result.shotCount, 1);
    const text = fs.readFileSync(archive).toString('utf8');
    assert.match(text, /\/01_镜头1\/video\.mp4/u);
    assert.doesNotMatch(text, /镜头2/u);
    assert.match(text, /资产1/u);
    assert.match(text, /图片配方/u);
    assert.match(text, /资产ID/u);
    assert.doesNotMatch(text, /历史提示词|input_reference_images|generation_history|format: 8/u);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('旧项目 ZIP 导入导出接口返回 404', async () => {
  const { db, root, service } = fixture();
  const app = express();
  app.use(projectRoutes({ delivery: service } as never, {
    app: { name: 'test', version: '1' }, server: {}, database: { path: ':memory:' },
    storage: { local_path: root }, ai: { providers: {} },
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/dramas/1/export`)).status, 404);
    assert.equal((await fetch(`${base}/dramas/import`, { method: 'POST' })).status, 404);
  } finally {
    server.close();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('成片与镜头包交付接口返回本地二进制并清理临时文件', async () => {
  const { db, root, config, service } = fixture();
  const first = addShot(db, root, 1);
  const episodeVideo = write(root, 'projects/1/videos/episode-1.mp4', MP4);
  const generation = db.prepare(`INSERT INTO video_generations (drama_id, episode_id, provider, prompt, status, video_url, local_path, media_type, created_at, updated_at, completed_at) VALUES (1, 1, 'local-composition', '成片', 'completed', ?, ?, 'video/mp4', datetime('now'), datetime('now'), datetime('now'))`).run(`/static/${episodeVideo}`, episodeVideo);
  db.prepare('UPDATE episodes SET video_url = ?, current_video_generation_id = ? WHERE id = 1').run(`/static/${episodeVideo}`, Number(generation.lastInsertRowid));
  const app = express();
  app.use(express.json());
  app.use(projectRoutes({ projects: { require: () => ({ episodes: [{ id: 1, title: '第一集' }] }) }, delivery: service } as never, config));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const preview = await fetch(`${base}/dramas/1/episodes/1/export-preview`);
    assert.equal(preview.status, 200);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), MP4);
    const shots = await fetch(`${base}/dramas/1/episodes/1/export-shots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyboard_ids: [first.shotId] }) });
    assert.equal(shots.status, 200);
    assert.ok((await shots.arrayBuffer()).byteLength > MP4.byteLength);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const transferDirectory = path.join(root, 'delivery-transfers');
    assert.equal(fs.readdirSync(transferDirectory).length, 0);
  } finally {
    server.close();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('镜头包拒绝缺少当前本地视频，成片拒绝缺少当前本地文件', () => {
  const { db, root, service } = fixture();
  try {
    addShot(db, root, 1, false);
    assert.throws(() => service.episodeVideo(1, 1), /成片|本地/u);
    assert.rejects(service.exportShots(1, 1, [], path.join(root, 'missing.zip')), /镜头1|视频/u);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
