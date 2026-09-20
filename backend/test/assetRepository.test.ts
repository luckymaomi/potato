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

test('项目资产库保存三类结构化卡和各自的生成输入参考图', () => {
  const { db, projectId, assets } = setup();
  try {
    const character = assets.createProjectAsset(projectId, {
      kind: 'character',
      name: '红女王（加冕）',
      text_profile: {
        age: '32岁', gender: '女', occupation: '夜城女王', faction: '王党',
        identity_tags: ['复仇者', '统治者'], face_shape: '冷峻鹅蛋脸', facial_features: '细长眼与高鼻梁',
        hairstyle: '黑色盘发', body_type: '高挑', skin_tone: '冷白', default_outfit: '深红加冕礼服',
        personality: '克制锋利', common_expressions: '审视', aura: '威严', voice_tone_id: 'queen-low',
        speech_rate: '缓慢', accent: '标准普通话', signature_phrase: '这座城，从来不是你的。',
      },
      output_type: 'character-layout-d',
      input_reference_images: ['/static/uploads/queen-face.png', '/static/uploads/queen-dress.png'],
    });
    const scene = assets.createProjectAsset(projectId, {
      kind: 'scene',
      name: '烛光王座厅',
      text_profile: { location_type: '王宫大厅', layout: '长厅尽头设王座', time_of_day: '深夜', light_source: '烛火', weather: '暴雨' },
      output_type: 'scene-detail',
      input_reference_images: ['/static/uploads/throne-hall.png'],
    });
    const prop = assets.createProjectAsset(projectId, {
      kind: 'prop',
      name: '血色王冠',
      text_profile: { category: '王权信物', material: '暗金与红宝石', condition: '边缘有旧裂痕', default_state: '闭合完整' },
      output_type: 'prop-state-variant',
      input_reference_images: ['/static/uploads/crown.png'],
    });

    assert.deepEqual(assets.listProjectAssets(projectId).map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      text_profile: item.text_profile,
      output_type: item.output_type,
      input_reference_images: item.input_reference_images,
    })), [
      {
        id: character.id,
        kind: 'character',
        name: '红女王（加冕）',
        text_profile: character.text_profile,
        output_type: 'character-layout-d',
        input_reference_images: ['/static/uploads/queen-face.png', '/static/uploads/queen-dress.png'],
      },
      {
        id: scene.id,
        kind: 'scene',
        name: '烛光王座厅',
        text_profile: scene.text_profile,
        output_type: 'scene-detail',
        input_reference_images: ['/static/uploads/throne-hall.png'],
      },
      {
        id: prop.id,
        kind: 'prop',
        name: '血色王冠',
        text_profile: prop.text_profile,
        output_type: 'prop-state-variant',
        input_reference_images: ['/static/uploads/crown.png'],
      },
    ]);
  } finally { db.close(); }
});

test('同项目各集复用同一资产 ID，分镜关系只保存当前项目资产', () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const now = new Date().toISOString();
    const secondEpisodeId = Number(db.prepare(`
      INSERT INTO episodes (drama_id, episode_number, title, created_at, updated_at) VALUES (?, 2, '第 2 集', ?, ?)
    `).run(projectId, now, now).lastInsertRowid);
    const queen = assets.createProjectAsset(projectId, { kind: 'character', name: '红女王（加冕）' });
    const crown = assets.createProjectAsset(projectId, { kind: 'prop', name: '血色王冠' });
    const otherProjectId = Number(db.prepare(`
      INSERT INTO dramas (title, metadata, created_at, updated_at) VALUES ('其他项目', '{}', ?, ?)
    `).run(now, now).lastInsertRowid);
    const foreign = assets.createProjectAsset(otherProjectId, { kind: 'scene', name: '其他项目王宫' });

    const firstShot = assets.createStoryboard({ episode_id: episodeId, title: '加冕', project_asset_ids: [queen.id, crown.id, foreign.id] });
    const secondShot = assets.createStoryboard({ episode_id: secondEpisodeId, title: '归来', project_asset_ids: [queen.id] });

    assert.deepEqual(firstShot.project_asset_ids, [queen.id, crown.id]);
    assert.deepEqual(secondShot.project_asset_ids, [queen.id]);
  } finally { db.close(); }
});

test('更新资产卡会规范化结构化文本和参考图数组', () => {
  const { db, projectId, assets } = setup();
  try {
    const card = assets.createProjectAsset(projectId, { kind: 'prop', name: '王冠' });
    const updated = assets.updateProjectAsset(card.id, {
      name: '血色王冠',
      text_profile: { material: ' 暗金 ', color: '', interaction_states: ['手持', '放置', '手持', ' '] },
      output_type: 'prop-state-variant',
      input_reference_images: [' /static/uploads/crown.png ', '/static/uploads/crown.png', ''],
    });

    assert.equal(updated.name, '血色王冠');
    assert.deepEqual(updated.text_profile, { material: '暗金', interaction_states: ['手持', '放置'] });
    assert.equal(updated.output_type, 'prop-state-variant');
    assert.deepEqual(updated.input_reference_images, ['/static/uploads/crown.png']);
  } finally { db.close(); }
});

test('分镜保存人工规格、项目资产和本镜额外参考图', () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const queen = assets.createProjectAsset(projectId, { kind: 'character', name: '红女王（加冕）' });
    const shot = assets.createStoryboard({
      episode_id: episodeId,
      title: '扶正王冠',
      description: '红女王在王座前扶正王冠',
      shot_size: '近景',
      camera_angle: '平视',
      camera_movement: '缓慢推进',
      composition: '人物居中，王座位于后景',
      action: '抬手扶正王冠',
      dialogue: '这座城，从来不是你的。',
      lighting: '烛光侧逆光',
      mood: '冷静、威严',
      sound: '暴雨与王冠轻响',
      image_prompt: '电影感宫廷近景',
      video_prompt: '从静止到缓慢抬手',
      project_asset_ids: [queen.id],
      extra_reference_images: ['/static/uploads/pose.png', '/static/uploads/light.png'],
    });

    assert.deepEqual(assets.getStoryboard(shot.id), shot);
    assert.deepEqual(shot.project_asset_ids, [queen.id]);
    assert.deepEqual(shot.extra_reference_images, ['/static/uploads/pose.png', '/static/uploads/light.png']);
  } finally { db.close(); }
});

test('删除项目资产后分镜托盘保留仍存在的资产', () => {
  const { db, projectId, episodeId, assets } = setup();
  try {
    const queen = assets.createProjectAsset(projectId, { kind: 'character', name: '红女王' });
    const crown = assets.createProjectAsset(projectId, { kind: 'prop', name: '王冠' });
    const shot = assets.createStoryboard({ episode_id: episodeId, title: '王座', project_asset_ids: [queen.id, crown.id] });
    assets.deleteProjectAsset(queen.id);

    assert.deepEqual(assets.getStoryboard(shot.id)?.project_asset_ids, [crown.id]);
  } finally { db.close(); }
});

test('删除镜头后按现有顺序生成连续镜号', () => {
  const { db, episodeId, assets } = setup();
  try {
    const first = assets.createStoryboard({ episode_id: episodeId, title: '一' });
    const second = assets.createStoryboard({ episode_id: episodeId, title: '二' });
    const third = assets.createStoryboard({ episode_id: episodeId, title: '三' });
    assets.deleteStoryboard(second.id);

    assert.deepEqual(assets.listStoryboards(episodeId).map((item) => [item.id, item.storyboard_number, item.title]), [
      [first.id, 1, '一'],
      [third.id, 2, '三'],
    ]);
  } finally { db.close(); }
});
