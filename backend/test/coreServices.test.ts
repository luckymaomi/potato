import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test, { after } from 'node:test';
import express from 'express';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { modelCapabilities, ProviderRegistry, type ProviderAdapter } from '../src/providers';
import { createServices } from '../src/services/container';
import { workspaceRoutes } from '../src/routes/workspaceRoutes';
import type { AppConfig, Logger } from '../src/types/core';

const log: Logger = { info() {}, warn() {}, error() {}, audit() {} };
const roots: string[] = [];
const TEST_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TEST_MP4 = `data:video/mp4;base64,${Buffer.from('\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0002\u0000isomiso2').toString('base64')}`;

after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function setup(options: {
  submitImage?: NonNullable<ProviderAdapter['submitImage']>;
  submitVideo?: NonNullable<ProviderAdapter['submitVideo']>;
  logger?: Logger;
} = {}) {
  const db = new Database(':memory:');
  initializeDatabase(db);
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-test-'));
  roots.push(storageRoot);
  const config: AppConfig = {
    app: { name: 'test', version: '1' },
    server: {},
    database: { path: ':memory:' },
    storage: { local_path: storageRoot, base_url: 'http://localhost:5679/static' },
    ai: { providers: { agnes: { enabled: true, base_url: 'https://api.test', api_key: 'secret' } } },
  };
  const registry = new ProviderRegistry();
  registry.register({
    descriptor: {
      id: 'agnes',
      label: 'Agnes test',
      aliases: [],
      capabilities: {
        textToImage: true,
        imageToImage: true,
        textToVideo: true,
        imageToVideo: true,
        asynchronous: false,
        multipleImageReferences: true,
        firstLastFrame: true,
      },
    },
    listModels: async () => [
      { id: 'agnes-image', label: 'Agnes Image', kind: 'image', capabilities: modelCapabilities(['text-to-image', 'image-to-image'], 8, ['1:1', '9:16'], 'adapter') },
      { id: 'agnes-video', label: 'Agnes Video', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 8, ['16:9', '9:16'], 'adapter', 'duration', [4, 6, 8]) },
    ],
    submitImage: options.submitImage ?? (async () => ({ status: 'completed', imageUrl: TEST_PNG })),
    submitVideo: options.submitVideo ?? (async () => ({ status: 'completed', videoUrl: TEST_MP4 })),
  });
  return { db, services: createServices(db, config, registry, options.logger ?? log), storageRoot, config };
}

async function taskDone(get: () => { status: string; error: string | null } | undefined): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = get();
    if (task?.status === 'completed') return;
    if (task?.status === 'failed') throw new Error(task.error ?? 'task failed');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('task did not finish');
}

test('项目服务持久化多话、项目资产和各话分镜', () => {
  const { db, services } = setup();
  try {
    const project = services.projects.create({ title: '夜城', metadata: { aspect_ratio: '9:16' } });
    services.projects.saveEpisodes(project.id, [
      { episode_number: 1, title: '归来', script_content: '雨夜归城' },
      { episode_number: 2, title: '审判', script_content: '王厅审判' },
    ]);
    const queen = services.assets.createProjectAsset(project.id, {
      kind: 'character',
      name: '红女王',
      text_profile: { occupation: '女王', default_outfit: '深红礼服' },
    });
    const episodes = services.projects.require(project.id).episodes ?? [];
    services.assets.createPanel({ episode_id: episodes[0]?.id, title: '归来', project_asset_ids: [queen.id] });
    services.assets.createPanel({ episode_id: episodes[1]?.id, title: '审判', project_asset_ids: [queen.id] });

    const saved = services.projects.require(project.id);
    assert.deepEqual(saved.episodes?.map((episode) => [episode.episode_number, episode.script_content]), [[1, '雨夜归城'], [2, '王厅审判']]);
    assert.deepEqual(saved.episodes?.map((episode) => episode.panels?.[0]?.project_asset_ids), [[queen.id], [queen.id]]);
    assert.deepEqual(saved.project_assets?.[0]?.text_profile, { occupation: '女王', default_outfit: '深红礼服' });
  } finally { db.close(); }
});

test('总览与本集结构按项目和剧集分别保存并在读取时保持对应关系', () => {
  const { db, services } = setup();
  try {
    const first = services.projects.create({
      title: '夜城归来',
      story_hook: '十年前失踪的人带着证据回来。',
      worldview: '夜城由旧王室和贵族共同控制。',
      storyline: '红女王逐场揭开旧案。',
      tone: '冷峻悬疑',
      reference_setting: '雨夜、黑曜王厅、红金烛光。',
    });
    services.projects.saveEpisodes(first.id, [{
      episode_number: 1,
      episode_goal: '完成归城并进入王厅。',
      conflict: '摄政公爵试图阻止她。',
      turning_point: '旧印章被摆上长桌。',
      ending_hook: '下一集追查共谋者。',
      scene_notes: '城门、王厅、密档室。',
      script_content: '第一场：雨夜归城。',
    }]);
    const second = services.projects.create({ title: '另一部剧', story_hook: '另一条故事钩子。' });
    services.projects.saveEpisodes(second.id, [{ episode_number: 1, episode_goal: '另一集目标。' }]);

    const saved = services.projects.require(first.id);
    assert.deepEqual(
      [saved.story_hook, saved.worldview, saved.storyline, saved.tone, saved.reference_setting],
      ['十年前失踪的人带着证据回来。', '夜城由旧王室和贵族共同控制。', '红女王逐场揭开旧案。', '冷峻悬疑', '雨夜、黑曜王厅、红金烛光。'],
    );
    assert.deepEqual(
      saved.episodes?.[0] && [saved.episodes[0].episode_goal, saved.episodes[0].conflict, saved.episodes[0].turning_point, saved.episodes[0].ending_hook, saved.episodes[0].scene_notes, saved.episodes[0].script_content],
      ['完成归城并进入王厅。', '摄政公爵试图阻止她。', '旧印章被摆上长桌。', '下一集追查共谋者。', '城门、王厅、密档室。', '第一场：雨夜归城。'],
    );
    assert.equal(services.projects.require(second.id).story_hook, '另一条故事钩子。');
    assert.equal(services.projects.require(second.id).episodes?.[0]?.episode_goal, '另一集目标。');
  } finally { db.close(); }
});

test('资产标准图生成消费用户保存的可见提示词和资产卡输入参考图', async () => {
  let receivedPrompt = '';
  let receivedReferences: string[] = [];
  const { db, services, storageRoot, config } = setup({
    submitImage: async (_context, request) => {
      receivedPrompt = request.prompt;
      receivedReferences = request.referenceImages;
      return { status: 'completed', imageUrl: TEST_PNG };
    },
  });
  const app = express();
  app.use(express.json());
  app.use(workspaceRoutes(services, config));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '资产生成' });
    const referencePath = path.join(storageRoot, 'uploads', 'queen.png');
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.writeFileSync(referencePath, Buffer.from(TEST_PNG.split(',')[1] as string, 'base64'));
    const asset = services.assets.createProjectAsset(project.id, {
      kind: 'character',
      name: '红女王',
      text_profile: { occupation: '夜城女王', hairstyle: '黑色盘发' },
      input_reference_images: ['/static/uploads/queen.png'],
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}/dramas/${project.id}/assets/${asset.id}`;
    assert.equal(asset.output_prompt, '');
    const assembled = await fetch(`http://127.0.0.1:${address.port}/dramas/${project.id}/assets/assemble-output-prompt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: asset.kind,
        name: asset.name,
        text_profile: asset.text_profile,
        output_type: 'character-layout-b',
      }),
    });
    assert.equal(assembled.status, 200);
    const assembledData = await assembled.json() as { data: { output_type: string; output_prompt: string } };
    assert.equal(assembledData.data.output_type, 'character-layout-b');
    assert.match(assembledData.data.output_prompt, /红女王.*夜城女王.*左脸右身/su);
    assert.equal(/图片参考锁定|img2img/u.test(assembledData.data.output_prompt), false);
    const prompt = '用户重写：电影感红女王定妆图，黑色盘发，深红礼服。';
    const saved = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_prompt: prompt }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json() as { data: { output_prompt: string } }).data.output_prompt, prompt);
    const response = await fetch(`${url}/generate-image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agnes-image', aspect_ratio: '9:16' }),
    });
    assert.equal(response.status, 201);
    const { data: row } = await response.json() as { data: { id: number; task_id: string; prompt: string } };
    await taskDone(() => services.tasks.get(row.task_id as string));

    assert.equal(receivedPrompt, prompt);
    assert.equal(row.prompt, prompt);
    assert.deepEqual(receivedReferences, ['/static/uploads/queen.png']);
    const current = services.assets.getProjectAsset(asset.id);
    assert.equal(current?.current_image_generation_id, row.id);
    assert.match(current?.image_url ?? '', /^\/static\/projects\//u);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});

test('单卡任务公开排队、生成、归档和本地文件完成状态', async () => {
  const observed: string[] = [];
  let releaseProvider = () => {};
  const gate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const { db, services, storageRoot } = setup({
    logger: { ...log, audit(event, detail) {
      if (event === 'task.stage') observed.push(String((detail as { message: string }).message));
    } },
    submitImage: async () => { await gate; return { status: 'completed', imageUrl: TEST_PNG }; },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '单卡状态' });
    const asset = services.assets.createProjectAsset(project.id, { kind: 'prop', name: '铜钥匙', output_prompt: '铜钥匙标准资产图' });
    const row = services.images.create({ dramaId: project.id, projectAssetId: asset.id, prompt: asset.output_prompt, model: 'agnes-image', aspectRatio: '1:1', referenceImages: [] });
    const taskId = row.task_id as string;
    assert.equal(services.tasks.get(taskId)?.status, 'pending');
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(services.tasks.get(taskId)?.status, 'processing');
    assert.equal(services.tasks.get(taskId)?.message, '正在生成');
    releaseProvider();
    await taskDone(() => services.tasks.get(taskId));
    assert.deepEqual(observed, ['正在生成', '归档中']);
    assert.equal(services.tasks.get(taskId)?.status, 'completed');
    const completed = services.images.get(row.id);
    assert.equal(completed?.available, true);
    assert.ok(completed?.local_path);
    assert.ok(fs.statSync(path.join(storageRoot, completed.local_path)).isFile());
  } finally { releaseProvider(); db.close(); }
});

test('分镜显式组装图片配方，图片生成消费用户保存的图片配方', async () => {
  let receivedPrompt = '';
  let receivedReferences: string[] = [];
  const { db, services, config } = setup({
    submitImage: async (_context, request) => {
      receivedPrompt = request.prompt;
      receivedReferences = request.referenceImages;
      return { status: 'completed', imageUrl: TEST_PNG };
    },
  });
  const app = express();
  app.use(express.json());
  app.use(workspaceRoutes(services, config));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '漫画底板消费' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const asset = services.assets.createProjectAsset(project.id, {
      kind: 'prop', name: '王冠', text_profile: { material: '暗金' },
    });
    db.prepare('UPDATE project_assets SET image_url = ? WHERE id = ?').run(TEST_PNG, asset.id);
    const shot = services.assets.createPanel({
      episode_id: episode.id,
      image_prompt: '王冠静物近景',
      project_asset_ids: [asset.id],
      extra_reference_images: ['https://cdn.test/light.png'],
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const shotUrl = `http://127.0.0.1:${address.port}/dramas/${project.id}/panels/${shot.id}`;
    const assembled = await fetch(`${shotUrl}/assemble-recipe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...shot, image_prompt: '王冠静物近景' }),
    });
    assert.equal(assembled.status, 200);
    const recipes = (await assembled.json() as { data: { image_recipe_prompt: string; image_recipe_references: string[] } }).data;
    assert.equal(recipes.image_recipe_prompt, '王冠静物近景\n道具卡「王冠」：材质：暗金\n干净画面；无字幕、无气泡、无水印');
    assert.deepEqual(recipes.image_recipe_references, [TEST_PNG, 'https://cdn.test/light.png']);

    const finalPrompt = '用户确认并改写的王冠静物图片配方';
    await services.assets.updatePanel(shot.id, {
      image_recipe_prompt: finalPrompt,
      image_recipe_references: recipes.image_recipe_references,
    });
    const response = await fetch(`${shotUrl}/generate-image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agnes-image', aspect_ratio: '1:1' }),
    });
    assert.equal(response.status, 201);
    const row = (await response.json() as { data: { id: number; task_id: string } }).data;
    await taskDone(() => services.tasks.get(row.task_id));

    assert.equal(receivedPrompt, finalPrompt);
    assert.deepEqual(receivedReferences, [TEST_PNG, 'https://cdn.test/light.png']);
    assert.equal(services.assets.getPanel(shot.id)?.current_image_generation_id, row.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});

test('规格变更后点生成会按最新规格自动组装配方', async () => {
  let receivedPrompt = '';
  const { db, services, config } = setup({
    submitImage: async (_context, request) => {
      receivedPrompt = request.prompt;
      return { status: 'completed', imageUrl: TEST_PNG };
    },
  });
  const app = express();
  app.use(express.json());
  app.use(workspaceRoutes(services, config));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '自动重装' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const asset = services.assets.createProjectAsset(project.id, {
      kind: 'prop', name: '王冠', text_profile: { material: '暗金' },
    });
    db.prepare('UPDATE project_assets SET image_url = ? WHERE id = ?').run(TEST_PNG, asset.id);
    const shot = services.assets.createPanel({
      episode_id: episode.id,
      action: '旧动作',
      project_asset_ids: [asset.id],
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const shotUrl = `http://127.0.0.1:${address.port}/dramas/${project.id}/panels/${shot.id}`;
    const first = await fetch(`${shotUrl}/assemble-recipe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: '旧动作', project_asset_ids: [asset.id] }),
    });
    assert.equal(first.status, 200);
    services.assets.updatePanel(shot.id, { action: '新动作：女王回眸' });
    assert.equal(services.assets.getPanel(shot.id)?.recipe_needs_reassembly, true);

    const response = await fetch(`${shotUrl}/generate-image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: '新动作：女王回眸',
        project_asset_ids: [asset.id],
        model: 'agnes-image',
        aspect_ratio: '1:1',
      }),
    });
    assert.equal(response.status, 201);
    const row = (await response.json() as { data: { task_id: string } }).data;
    await taskDone(() => services.tasks.get(row.task_id));
    assert.match(receivedPrompt, /新动作：女王回眸/);
    assert.equal(services.assets.getPanel(shot.id)?.recipe_needs_reassembly, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});

test('分镜台路由返回当前话工作区', async () => {
  const { db, services, config } = setup();
  const app = express();
  app.use(express.json());
  app.use(workspaceRoutes(services, config));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const project = services.projects.create({ title: '路由可达' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    services.assets.createPanel({ episode_id: episode.id, title: '第一镜' });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/dramas/${project.id}`;
    const panels = await fetch(`${base}/panels?episode_id=${episode.id}`);
    const readiness = await fetch(`${base}/panels/${services.assets.listPanels(episode.id)[0].id}/readiness`);
    assert.equal(panels.status, 200);
    assert.equal(readiness.status, 200);
    assert.equal((await panels.json() as { data: { items: unknown[] } }).data.items.length, 1);
    const readinessData = (await readiness.json() as {
      data: {
        recipe: { ready: boolean; reason?: string };
        image: { ready: boolean; reason?: string };
      };
    }).data;
    assert.equal(readinessData.recipe.ready, true);
    assert.equal(readinessData.image.ready, false);
    assert.match(readinessData.image.reason ?? "", /底板/u);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});

test('图片历史可切换项目资产当前标准图', async () => {
  const { db, services } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '标准图版本' });
    const asset = services.assets.createProjectAsset(project.id, { kind: 'prop', name: '王冠' });
    const first = services.images.create({ dramaId: project.id, projectAssetId: asset.id, prompt: '版本一', model: 'agnes-image', aspectRatio: '1:1', referenceImages: [] });
    await taskDone(() => services.tasks.get(first.task_id as string));
    const second = services.images.create({ dramaId: project.id, projectAssetId: asset.id, prompt: '版本二', model: 'agnes-image', aspectRatio: '1:1', referenceImages: [] });
    await taskDone(() => services.tasks.get(second.task_id as string));
    const firstCompleted = services.images.get(first.id);
    services.images.select(first.id);

    assert.equal(services.assets.getProjectAsset(asset.id)?.current_image_generation_id, first.id);
    assert.equal(services.assets.getProjectAsset(asset.id)?.image_url, firstCompleted?.image_url);
    assert.deepEqual(services.images.list(project.id).map((item) => item.prompt), ['版本二', '版本一']);
  } finally { db.close(); }
});

test('已完成并归档的标准图历史可以删除，进行中的不能删', async () => {
  let releaseProvider = () => {};
  const gate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const { db, services, storageRoot } = setup({
    submitImage: async () => { await gate; return { status: 'completed', imageUrl: TEST_PNG }; },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '删除标准图历史' });
    const asset = services.assets.createProjectAsset(project.id, { kind: 'character', name: '红女王' });
    const pending = services.images.create({
      dramaId: project.id,
      projectAssetId: asset.id,
      prompt: '进行中',
      model: 'agnes-image',
      aspectRatio: '1:1',
      referenceImages: [],
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(services.images.get(pending.id)?.status, 'processing');
    await assert.rejects(
      () => services.images.remove(pending.id),
      (error: unknown) => error instanceof Error && error.message.includes('进行中'),
    );
    releaseProvider();
    await taskDone(() => services.tasks.get(pending.task_id as string));
    const completed = services.images.get(pending.id);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.available, true);
    assert.equal(services.assets.getProjectAsset(asset.id)?.current_image_generation_id, completed?.id);
    const localPath = completed?.local_path as string;
    assert.equal(fs.existsSync(path.join(storageRoot, localPath)), true);

    const result = await services.images.remove(pending.id);
    assert.equal(result.removed, true);
    assert.equal(services.images.get(pending.id), undefined);
    assert.equal(services.assets.getProjectAsset(asset.id)?.current_image_generation_id, null);
    assert.equal(services.assets.getProjectAsset(asset.id)?.image_url, null);
    assert.equal(fs.existsSync(path.join(storageRoot, localPath)), false);
  } finally {
    releaseProvider();
    db.close();
  }
});

test('本地上传成为资产标准图并保留 generation 历史', async () => {
  const { db, services, storageRoot } = setup();
  try {
    const project = services.projects.create({ title: '人工标准图' });
    const asset = services.assets.createProjectAsset(project.id, { kind: 'character', name: '林岚' });
    const source = path.join(storageRoot, 'source.png');
    fs.writeFileSync(source, Buffer.from(TEST_PNG.split(',')[1] as string, 'base64'));
    const uploaded = await services.images.importLocal({
      dramaId: project.id,
      projectAssetId: asset.id,
      sourcePath: source,
      prompt: '人工上传标准资产图',
    });

    assert.equal(uploaded.status, 'completed');
    assert.equal(uploaded.provider, 'local-upload');
    assert.equal(uploaded.available, true);
    assert.equal(services.assets.getProjectAsset(asset.id)?.current_image_generation_id, uploaded.id);
    assert.equal(services.images.list(project.id)[0]?.id, uploaded.id);
  } finally { db.close(); }
});

test('全新 schema 支持项目资产卡和分镜额外参考图', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const dramaColumns = db.prepare('PRAGMA table_info(dramas)').all() as Array<{ name: string }>;
    const episodeColumns = db.prepare('PRAGMA table_info(episodes)').all() as Array<{ name: string }>;
    const assetColumns = db.prepare('PRAGMA table_info(project_assets)').all() as Array<{ name: string }>;
    const panelColumns = db.prepare('PRAGMA table_info(panels)').all() as Array<{ name: string }>;
    const imageColumns = db.prepare('PRAGMA table_info(image_generations)').all() as Array<{ name: string }>;
    assert.equal(dramaColumns.some((column) => column.name === 'story_hook'), true);
    assert.equal(dramaColumns.some((column) => column.name === 'worldview'), true);
    assert.equal(dramaColumns.some((column) => column.name === 'storyline'), true);
    assert.equal(dramaColumns.some((column) => column.name === 'tone'), true);
    assert.equal(dramaColumns.some((column) => column.name === 'reference_setting'), true);
    assert.equal(episodeColumns.some((column) => column.name === 'episode_goal'), true);
    assert.equal(episodeColumns.some((column) => column.name === 'conflict'), true);
    assert.equal(episodeColumns.some((column) => column.name === 'turning_point'), true);
    assert.equal(episodeColumns.some((column) => column.name === 'ending_hook'), true);
    assert.equal(episodeColumns.some((column) => column.name === 'scene_notes'), true);
    assert.equal(assetColumns.some((column) => column.name === 'text_profile'), true);
    assert.equal(assetColumns.some((column) => column.name === 'output_type'), true);
    assert.equal(assetColumns.some((column) => column.name === 'output_prompt'), true);
    assert.equal(assetColumns.some((column) => column.name === 'input_reference_images'), true);
    assert.equal(panelColumns.some((column) => column.name === 'extra_reference_images'), true);
    assert.equal(panelColumns.some((column) => column.name === 'image_recipe_prompt'), true);
    assert.equal(panelColumns.some((column) => column.name === 'image_recipe_references'), true);
    assert.equal(panelColumns.some((column) => column.name === 'image_needs_review'), true);
    assert.equal(panelColumns.some((column) => column.name === 'recipe_needs_reassembly'), true);
    assert.equal(imageColumns.some((column) => column.name === 'project_asset_id'), true);
  } finally { db.close(); }
});
