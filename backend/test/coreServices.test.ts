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
import { assembleStoryboardRecipes } from '../src/services/storyboardPromptAssembler';
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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-ai-drama-test-'));
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

test('项目服务持久化多集、项目资产和各集分镜', () => {
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
    services.assets.createStoryboard({ episode_id: episodes[0]?.id, title: '归来', project_asset_ids: [queen.id] });
    services.assets.createStoryboard({ episode_id: episodes[1]?.id, title: '审判', project_asset_ids: [queen.id] });

    const saved = services.projects.require(project.id);
    assert.deepEqual(saved.episodes?.map((episode) => [episode.episode_number, episode.script_content]), [[1, '雨夜归城'], [2, '王厅审判']]);
    assert.deepEqual(saved.episodes?.map((episode) => episode.storyboards?.[0]?.project_asset_ids), [[queen.id], [queen.id]]);
    assert.deepEqual(saved.project_assets?.[0]?.text_profile, { occupation: '女王', default_outfit: '深红礼服' });
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
    const asset = services.assets.createProjectAsset(project.id, { kind: 'prop', name: '铜钥匙' });
    const row = services.images.create({ dramaId: project.id, projectAssetId: asset.id, prompt: asset.output_prompt, referenceImages: [] });
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

test('分镜图片消费图片配方的文本和参考图', async () => {
  let receivedPrompt = '';
  let receivedReferences: string[] = [];
  const { db, services } = setup({
    submitImage: async (_context, request) => {
      receivedPrompt = request.prompt;
      receivedReferences = request.referenceImages;
      return { status: 'completed', imageUrl: TEST_PNG };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '分镜图消费' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const asset = services.assets.createProjectAsset(project.id, {
      kind: 'prop', name: '王冠', text_profile: { material: '暗金' },
    });
    db.prepare('UPDATE project_assets SET image_url = ? WHERE id = ?').run(TEST_PNG, asset.id);
    const shot = services.assets.createStoryboard({
      episode_id: episode.id,
      image_prompt: '王冠静物近景',
      project_asset_ids: [asset.id],
      extra_reference_images: ['https://cdn.test/light.png'],
    });
    const recipe = assembleStoryboardRecipes({
      shot,
      assets: [services.assets.getProjectAsset(asset.id) as NonNullable<ReturnType<typeof services.assets.getProjectAsset>>],
    }).imageRecipe;
    const row = services.images.create({
      dramaId: project.id,
      storyboardId: shot.id,
      prompt: recipe.imagePrompt,
      model: 'agnes-image',
      aspectRatio: '1:1',
      referenceImages: recipe.imageReferences,
    });
    await taskDone(() => services.tasks.get(row.task_id as string));

    assert.equal(receivedPrompt, '王冠静物近景\n道具卡「王冠」：材质：暗金');
    assert.deepEqual(receivedReferences, [TEST_PNG, 'https://cdn.test/light.png']);
    assert.equal(services.assets.getStoryboard(shot.id)?.current_image_generation_id, row.id);
  } finally { db.close(); }
});

test('视频生成分别消费分镜图首帧和视频配方辅助参考图', async () => {
  let firstFrame = '';
  let receivedReferences: string[] = [];
  let receivedPrompt = '';
  const { db, services } = setup({
    submitVideo: async (_context, request) => {
      firstFrame = request.firstFrame ?? '';
      receivedReferences = request.referenceImages;
      receivedPrompt = request.prompt;
      return { status: 'completed', videoUrl: TEST_MP4 };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '视频消费' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const asset = services.assets.createProjectAsset(project.id, { kind: 'scene', name: '王厅', text_profile: {} });
    db.prepare('UPDATE project_assets SET image_url = ? WHERE id = ?').run('https://cdn.test/hall.png', asset.id);
    const shot = services.assets.createStoryboard({
      episode_id: episode.id,
      video_prompt: '人物缓慢走向王座',
      camera_movement: '稳定推进',
      sound: '脚步回声',
      project_asset_ids: [asset.id],
      extra_reference_images: ['https://cdn.test/pose.png'],
    });
    const recipe = assembleStoryboardRecipes({
      shot,
      assets: [services.assets.getProjectAsset(asset.id) as NonNullable<ReturnType<typeof services.assets.getProjectAsset>>],
    }).videoRecipe;
    const row = services.videos.create({
      dramaId: project.id,
      storyboardId: shot.id,
      prompt: recipe.videoPrompt,
      model: 'agnes-video',
      duration: 6,
      aspectRatio: '9:16',
      firstFrame: 'https://cdn.test/storyboard.png',
      referenceImages: recipe.videoReferences,
    });
    await taskDone(() => services.tasks.get(row.task_id as string));

    assert.equal(firstFrame, 'https://cdn.test/storyboard.png');
    assert.deepEqual(receivedReferences, ['https://cdn.test/hall.png', 'https://cdn.test/pose.png']);
    assert.equal(receivedPrompt, '人物缓慢走向王座\n场景卡「王厅」\n运镜：稳定推进\n声音：脚步回声');
    assert.equal(services.assets.getStoryboard(shot.id)?.current_video_generation_id, row.id);
  } finally { db.close(); }
});

test('图片历史可切换项目资产当前标准图', async () => {
  const { db, services } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '标准图版本' });
    const asset = services.assets.createProjectAsset(project.id, { kind: 'prop', name: '王冠' });
    const first = services.images.create({ dramaId: project.id, projectAssetId: asset.id, prompt: '版本一', model: 'agnes-image', referenceImages: [] });
    await taskDone(() => services.tasks.get(first.task_id as string));
    const second = services.images.create({ dramaId: project.id, projectAssetId: asset.id, prompt: '版本二', model: 'agnes-image', referenceImages: [] });
    await taskDone(() => services.tasks.get(second.task_id as string));
    const firstCompleted = services.images.get(first.id);
    services.images.select(first.id);

    assert.equal(services.assets.getProjectAsset(asset.id)?.current_image_generation_id, first.id);
    assert.equal(services.assets.getProjectAsset(asset.id)?.image_url, firstCompleted?.image_url);
    assert.deepEqual(services.images.list(project.id).map((item) => item.prompt), ['版本二', '版本一']);
  } finally { db.close(); }
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

test('项目 ZIP 往返保存资产产出规格、分镜引用、参考图和当前标准图', async () => {
  const { db, services, storageRoot } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '归档往返', metadata: { aspect_ratio: '9:16' } });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const uploads = path.join(storageRoot, 'uploads');
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(path.join(uploads, 'asset-input.png'), Buffer.from(TEST_PNG.split(',')[1] as string, 'base64'));
    fs.writeFileSync(path.join(uploads, 'shot-input.png'), Buffer.from(TEST_PNG.split(',')[1] as string, 'base64'));
    const asset = services.assets.createProjectAsset(project.id, {
      kind: 'character',
      name: '林岚',
      text_profile: { occupation: '记者' },
      output_type: 'character-layout-c',
      output_prompt: '用户确认的林岚 4+3 标准图提示词。',
      input_reference_images: ['/static/uploads/asset-input.png'],
    });
    const assetImage = services.images.create({
      dramaId: project.id,
      projectAssetId: asset.id,
      prompt: asset.output_prompt,
      model: 'agnes-image',
      referenceImages: asset.input_reference_images,
    });
    await taskDone(() => services.tasks.get(assetImage.task_id as string));
    const shot = services.assets.createStoryboard({
      episode_id: episode.id,
      title: '归来',
      image_prompt: '雨夜归来',
      project_asset_ids: [asset.id],
      extra_reference_images: ['/static/uploads/shot-input.png'],
    });
    const shotRecipe = assembleStoryboardRecipes({
      shot,
      assets: [services.assets.getProjectAsset(asset.id) as NonNullable<ReturnType<typeof services.assets.getProjectAsset>>],
    }).imageRecipe;
    const shotImage = services.images.create({
      dramaId: project.id,
      storyboardId: shot.id,
      prompt: shotRecipe.imagePrompt,
      model: 'agnes-image',
      referenceImages: shotRecipe.imageReferences,
    });
    await taskDone(() => services.tasks.get(shotImage.task_id as string));

    const archivePath = path.join(storageRoot, 'project.zip');
    await services.projectArchives.export(project.id, archivePath);
    const imported = await services.projectArchives.import(archivePath);
    const importedAsset = imported.project_assets?.[0];
    const importedShot = imported.episodes?.[0]?.storyboards?.[0];
    assert.deepEqual(importedAsset?.text_profile, { occupation: '记者' });
    assert.equal(importedAsset?.output_type, 'character-layout-c');
    assert.equal(importedAsset?.output_prompt, '用户确认的林岚 4+3 标准图提示词。');
    assert.match(importedAsset?.input_reference_images[0] ?? '', new RegExp(`^/static/projects/${imported.id}/references/`, 'u'));
    assert.deepEqual(importedShot?.project_asset_ids, [importedAsset?.id]);
    assert.match(importedShot?.extra_reference_images[0] ?? '', new RegExp(`^/static/projects/${imported.id}/references/`, 'u'));
    assert.equal(importedAsset?.current_image_generation_id, services.images.list(imported.id).find((item) => item.project_asset_id === importedAsset?.id)?.id);
    assert.equal(importedShot?.current_image_generation_id, services.images.list(imported.id).find((item) => item.storyboard_id === importedShot?.id)?.id);
  } finally { db.close(); }
});

test('全新 schema 支持项目资产卡和分镜额外参考图', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const assetColumns = db.prepare('PRAGMA table_info(project_assets)').all() as Array<{ name: string }>;
    const storyboardColumns = db.prepare('PRAGMA table_info(storyboards)').all() as Array<{ name: string }>;
    const imageColumns = db.prepare('PRAGMA table_info(image_generations)').all() as Array<{ name: string }>;
    assert.equal(assetColumns.some((column) => column.name === 'text_profile'), true);
    assert.equal(assetColumns.some((column) => column.name === 'output_type'), true);
    assert.equal(assetColumns.some((column) => column.name === 'output_prompt'), true);
    assert.equal(assetColumns.some((column) => column.name === 'input_reference_images'), true);
    assert.equal(storyboardColumns.some((column) => column.name === 'extra_reference_images'), true);
    assert.equal(imageColumns.some((column) => column.name === 'project_asset_id'), true);
  } finally { db.close(); }
});
