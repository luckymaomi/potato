import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import express from 'express';
import { initializeDatabase } from '../src/db/schema';
import { ValidationError } from '../src/errors';
import { resolveError } from '../src/errorContract';
import { ProviderRegistry } from '../src/providers';
import { failure } from '../src/response';
import { workspaceRoutes } from '../src/routes/workspaceRoutes';
import { AssetRepository } from '../src/services/assetRepository';
import { createServices } from '../src/services/container';
import {
  assertEpisodeReadyForComposition,
  assertStoryboardImageReady,
  assertStoryboardVideoReady,
  hasForbiddenVideoFrameLayout,
} from '../src/services/storyboardReadiness';
import type { AppConfig, Logger } from '../src/types/core';

const log: Logger = { info() {}, warn() {}, error() {}, audit() {} };

function setup() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  const repository = new AssetRepository(db);
  const now = new Date().toISOString();
  const dramaId = Number(db.prepare(`INSERT INTO dramas (title, created_at, updated_at) VALUES ('验收返工', ?, ?)`).run(now, now).lastInsertRowid);
  const episodeId = Number(db.prepare(`INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第 1 集', ?, ?)`).run(dramaId, now, now).lastInsertRowid);
  return { db, repository, dramaId, episodeId };
}

function createReadyShot(repository: AssetRepository, episodeId: number, assetIds: number[] = []) {
  return repository.createStoryboard({
    episode_id: episodeId,
    title: '王厅对峙',
    image_recipe_prompt: '已保存图片配方',
    video_recipe_prompt: '已保存视频配方',
    project_asset_ids: assetIds,
  });
}

test('改资产文本或标准图时，引用镜头的图片和视频均待复核', () => {
  const { db, repository, dramaId, episodeId } = setup();
  try {
    const asset = repository.createProjectAsset(dramaId, { kind: 'character', name: '林岚', text_profile: { occupation: '记者' } });
    const shot = createReadyShot(repository, episodeId, [asset.id]);

    repository.updateProjectAsset(asset.id, { text_profile: { occupation: '卧底记者' } });
    assert.equal(repository.getStoryboard(shot.id)?.image_needs_review, true);
    assert.equal(repository.getStoryboard(shot.id)?.video_needs_review, true);

    repository.markAssetImageChanged(asset.id);
    assert.equal(repository.getStoryboard(shot.id)?.image_needs_review, true);
    assert.equal(repository.getStoryboard(shot.id)?.video_needs_review, true);
  } finally { db.close(); }
});

test('改出场资产、镜头规格或额外参考图后，配方待重装且图片生成被拒', () => {
  const { db, repository, dramaId, episodeId } = setup();
  try {
    const asset = repository.createProjectAsset(dramaId, { kind: 'prop', name: '旧印章' });
    const shot = createReadyShot(repository, episodeId, [asset.id]);
    repository.updateStoryboard(shot.id, { extra_reference_images: ['/static/reference.png'] });

    const stale = repository.getStoryboard(shot.id);
    assert.equal(stale?.recipe_needs_reassembly, true);
    assert.equal(stale?.image_needs_review, true);
    assert.equal(stale?.video_needs_review, true);
    assert.throws(() => assertStoryboardImageReady(stale as NonNullable<typeof stale>, [repository.getProjectAsset(asset.id)!]), ValidationError);
  } finally { db.close(); }
});

test('修改镜头规格后显式重装并保存两份配方，才清除配方待重装', () => {
  const { db, repository, episodeId } = setup();
  try {
    const shot = createReadyShot(repository, episodeId);
    repository.updateStoryboard(shot.id, { action: '转身离开' });
    assert.equal(repository.getStoryboard(shot.id)?.recipe_needs_reassembly, true);
    repository.updateStoryboard(shot.id, {
      action: '转身离开',
      image_recipe_prompt: '重装后的图片配方',
      video_recipe_prompt: '重装后的视频配方',
      recipe_reassembled: true,
    });
    assert.equal(repository.getStoryboard(shot.id)?.recipe_needs_reassembly, false);
  } finally { db.close(); }
});

test('重出、选用或清除分镜图时，视频待复核；选用新图清除图片待复核', () => {
  const { db, repository, episodeId } = setup();
  try {
    const shot = createReadyShot(repository, episodeId);
    repository.markStoryboardImageChanged(shot.id, { imageSelected: true });
    assert.equal(repository.getStoryboard(shot.id)?.image_needs_review, false);
    assert.equal(repository.getStoryboard(shot.id)?.video_needs_review, true);

    repository.markStoryboardImageChanged(shot.id, { imageSelected: false });
    assert.equal(repository.getStoryboard(shot.id)?.video_needs_review, true);
  } finally { db.close(); }
});

test('缺角色标准图、视频九宫格污染和待复核视频均映射为 4xx 门闸', () => {
  const { db, repository, dramaId, episodeId } = setup();
  try {
    const character = repository.createProjectAsset(dramaId, { kind: 'character', name: '林岚' });
    const shot = createReadyShot(repository, episodeId, [character.id]);
    assert.throws(() => assertStoryboardImageReady(repository.getStoryboard(shot.id)!, [repository.getProjectAsset(character.id)!]), ValidationError);
    assert.equal(hasForbiddenVideoFrameLayout('九宫格分屏展示角色反应'), true);
    assert.throws(() => assertStoryboardVideoReady({ ...repository.getStoryboard(shot.id)!, video_recipe_prompt: '九宫格分屏展示角色反应', image_url: '/static/frame.png' }), ValidationError);
    assert.throws(() => assertEpisodeReadyForComposition([{ ...repository.getStoryboard(shot.id)!, video_url: '/static/shot.mp4', video_needs_review: true }]), ValidationError);
  } finally { db.close(); }
});

test('视频主干、运镜和动作同时为空时只返回风险提示，不阻断视频生成', () => {
  const { db, repository, episodeId } = setup();
  try {
    const shot = createReadyShot(repository, episodeId);
    const readiness = assertStoryboardVideoReady({ ...repository.getStoryboard(shot.id)!, image_url: '/static/frame.png', video_recipe_prompt: '已保存视频配方', video_needs_review: true });
    assert.match(readiness.warning ?? '', /运镜|动作/u);
  } finally { db.close(); }
});

test('生成和合成入口把就绪失败返回为 4xx', async () => {
  const db = new Database(':memory:');
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-readiness-'));
  initializeDatabase(db);
  const config: AppConfig = { app: { name: 'test', version: '1' }, server: {}, database: { path: ':memory:' }, storage: { local_path: storage }, ai: { providers: {} } };
  const services = createServices(db, config, new ProviderRegistry(), log);
  const app = express();
  app.use(express.json());
  app.use(workspaceRoutes(services, config));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const resolved = resolveError(error);
    failure(res, resolved.responseStatus, resolved.error.code, resolved.error.message);
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const project = services.projects.create({ title: '路由门闸' });
    const episode = project.episodes?.[0]!;
    const character = services.assets.createProjectAsset(project.id, { kind: 'character', name: '林岚' });
    const shot = services.assets.createStoryboard({ episode_id: episode.id, image_recipe_prompt: '图片配方', video_recipe_prompt: '九宫格分屏', project_asset_ids: [character.id] });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/dramas/${project.id}`;
    const image = await fetch(`${base}/storyboards/${shot.id}/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(image.status, 400);
    db.prepare("INSERT INTO image_generations (drama_id, storyboard_id, prompt, reference_images, image_url, local_path, status, created_at, updated_at) VALUES (?, ?, '首帧', '[]', '/static/frame.png', 'frame.png', 'completed', ?, ?)")
      .run(project.id, shot.id, new Date().toISOString(), new Date().toISOString());
    const imageId = Number((db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id);
    db.prepare('UPDATE storyboards SET image_url = ?, current_image_generation_id = ? WHERE id = ?').run('/static/frame.png', imageId, shot.id);
    const video = await fetch(`${base}/storyboards/${shot.id}/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(video.status, 400);
    db.prepare('UPDATE storyboards SET video_url = ?, video_needs_review = 1 WHERE id = ?').run('/static/shot.mp4', shot.id);
    const compose = await fetch(`${base}/episodes/${episode.id}/compose`, { method: 'POST' });
    assert.equal(compose.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(storage, { recursive: true, force: true });
  }
});
