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

test('全局资产加入项目时锁定版本且库更新不污染既有项目', () => {
  const { db, projectId, assets } = setup();
  try {
    const library = assets.createLibraryItem({ kind: 'character', name: '小林', visual_description: '黑色雨衣，短发' });
    db.prepare('UPDATE asset_library_items SET current_image_generation_id = 11, image_url = ? WHERE id = ?')
      .run('/static/library/11.png', library.id);
    const bound = assets.createProjectAsset(projectId, { from_library_item_id: library.id });
    assert.equal(bound.locked_image_generation_id, 11);
    assert.equal(bound.visual_description, '黑色雨衣，短发');

    db.prepare('UPDATE asset_library_items SET current_image_generation_id = 12, image_url = ? WHERE id = ?')
      .run('/static/library/12.png', library.id);
    assert.equal(assets.getProjectAsset(bound.id)?.locked_image_generation_id, 11);

    const upgraded = assets.upgradeProjectAsset(bound.id);
    assert.equal(upgraded.locked_image_generation_id, 12);
    assert.equal(upgraded.image_url, '/static/library/12.png');
  } finally { db.close(); }
});

test('项目资产依赖只允许同项目无环关系', () => {
  const { db, projectId, assets } = setup();
  try {
    const base = assets.createProjectAsset(projectId, { kind: 'character', name: '标准人物' });
    const derived = assets.createProjectAsset(projectId, { kind: 'character', name: '换装人物' });
    const updated = assets.updateProjectAsset(derived.id, { dependency_asset_ids: [base.id] });
    assert.deepEqual(updated.dependency_asset_ids, [base.id]);
    assert.throws(() => assets.updateProjectAsset(base.id, { dependency_asset_ids: [derived.id] }), /循环/u);

    const now = new Date().toISOString();
    const otherProject = Number(db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('其他项目', '{}', ?, ?)
    `).run(now, now).lastInsertRowid);
    const foreign = assets.createProjectAsset(otherProject, { kind: 'prop', name: '越界道具' });
    assert.throws(() => assets.updateProjectAsset(derived.id, { dependency_asset_ids: [foreign.id] }), /同一项目/u);
  } finally { db.close(); }
});

test('删除项目资产会清理分镜托盘和依赖关系', () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const base = assets.createProjectAsset(projectId, { kind: 'character', name: '基础人物' });
    const derived = assets.createProjectAsset(projectId, { kind: 'prop', name: '人物道具', dependency_asset_ids: [base.id] });
    const [shot] = assets.syncStoryboards(episodeId, [{ title: '删除边界', project_asset_ids: [base.id, derived.id] }]);
    assert.ok(shot);

    assert.equal(assets.deleteProjectAsset(base.id), true);
    assert.equal(assets.getProjectAsset(base.id), undefined);
    assert.deepEqual(assets.getProjectAsset(derived.id)?.dependency_asset_ids, []);
    assert.deepEqual(assets.getStoryboard(shot.id)?.project_asset_ids, [derived.id]);
    assert.throws(() => assets.deleteProjectAsset(base.id), /项目资产不存在/u);
  } finally { db.close(); }
});

test('分镜完整规格全部可选并能保存项目资产托盘与网格提示', () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const character = assets.createProjectAsset(projectId, { kind: 'character', name: '小林' });
    const shot = assets.createStoryboard({
      episode_id: episodeId,
      title: '意外闯入',
      shot_size: '全景',
      camera_angle: '平视',
      camera_movement: '固定',
      composition: '办公室门口构图',
      lighting: '冷白顶光',
      mood: '错愕',
      sound: '推门声',
      negative_prompt: '不要多余人物',
      grid_rows: 3,
      grid_columns: 3,
      project_asset_ids: [character.id],
    });
    assert.equal(shot.shot_size, '全景');
    assert.equal(shot.negative_prompt, '不要多余人物');
    assert.equal(shot.grid_rows, 3);
    assert.equal(shot.grid_columns, 3);
    assert.deepEqual(shot.project_asset_ids, [character.id]);

    const empty = assets.createStoryboard({ episode_id: episodeId });
    assert.equal(empty.title, null);
    assert.deepEqual(empty.project_asset_ids, []);
  } finally { db.close(); }
});
