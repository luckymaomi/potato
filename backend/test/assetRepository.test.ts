import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { AssetRepository } from '../src/services/assetRepository';

function setup() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  const now = new Date().toISOString();
  const projectId = Number(db.prepare(`
    INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('资产测试', '{}', ?, ?)
  `).run(now, now).lastInsertRowid);
  const episodeId = Number(db.prepare(`
    INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 1, '第 1 集', ?, ?)
  `).run(projectId, now, now).lastInsertRowid);
  return { db, projectId, episodeId, assets: new AssetRepository(db) };
}

test('资产同步按稳定自然键复用 ID 和已有媒体', () => {
  const { db, projectId, assets } = setup();
  try {
    const first = assets.syncCharacters(projectId, [{ name: '林澈', description: '记者', appearance: '短发风衣' }]);
    db.prepare('UPDATE characters SET image_url = ? WHERE id = ?').run('https://cdn.test/lin.png', first[0]?.id);
    const second = assets.syncCharacters(projectId, [{ name: '林澈', description: '调查记者', appearance: '短发风衣' }]);
    assert.equal(second[0]?.id, first[0]?.id);
    assert.equal(second[0]?.image_url, 'https://cdn.test/lin.png');
    assert.equal(second[0]?.description, '调查记者');
  } finally { db.close(); }
});

test('分镜关系只保存自己显式关联且属于当前项目的资产 ID', () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const [lin, shen] = assets.syncCharacters(projectId, [{ name: '林澈', appearance: '短发风衣' }, { name: '沈雾', appearance: '黑色夹克' }]);
    const [pier, room] = assets.syncScenes(projectId, [{ location: '旧码头', prompt: '雨夜码头' }, { location: '信号室', prompt: '红灯房间' }]);
    const [letter, recorder] = assets.syncProps(projectId, [{ name: '来信', prompt: '泛黄信封' }, { name: '录音机', prompt: '黑色录音机' }]);
    assert.ok(lin && shen && pier && room && letter && recorder);
    const [shot] = assets.syncStoryboards(episodeId, [{
      title: '来信引路', image_prompt: '林澈在旧码头打开来信', video_prompt: '镜头推近',
      characters: ['林澈'], scenes: ['旧码头'], props: ['来信'],
    }]);
    assert.ok(shot);
    assert.deepEqual(shot.character_ids, [lin.id]);
    assert.deepEqual(shot.scene_ids, [pier.id]);
    assert.deepEqual(shot.prop_ids, [letter.id]);
  } finally { db.close(); }
});

test('资产仓库不会把其他项目的 ID 写入分镜关系', () => {
  const { db, episodeId, assets } = setup();
  try {
    const now = new Date().toISOString();
    const otherProject = Number(db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('其他项目', '{}', ?, ?)
    `).run(now, now).lastInsertRowid);
    const [foreignCharacter] = assets.syncCharacters(otherProject, [{ name: '越界角色' }]);
    assert.ok(foreignCharacter);
    const [shot] = assets.syncStoryboards(episodeId, [{ title: '边界测试', character_ids: [foreignCharacter.id] }]);
    assert.deepEqual(shot?.character_ids, []);
  } finally { db.close(); }
});
