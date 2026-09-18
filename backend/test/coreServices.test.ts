import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Database from 'better-sqlite3';
import * as unzipper from 'unzipper';
import { initializeDatabase } from '../src/db/schema';
import { modelCapabilities, ProviderRegistry, type ProviderAdapter } from '../src/providers';
import { createServices } from '../src/services/container';
import type { AppConfig, Logger } from '../src/types/core';

const config: AppConfig = {
  app: { name: 'test', version: '1' },
  server: {},
  database: { path: ':memory:' },
  storage: { local_path: './data/test-storage', base_url: 'http://localhost:5679/static' },
  ai: {
    providers: {
      agnes: {
        enabled: true,
        base_url: 'https://api.test',
        api_key: 'secret',
      },
      pearapi: { enabled: true, base_url: 'https://pear.test', api_key: '' },
    },
  },
};
const log: Logger = { info() {}, warn() {}, error() {} };
const temporaryStorageRoots: string[] = [];
const TEST_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TEST_MP4 = `data:video/mp4;base64,${Buffer.from('\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0002\u0000isomiso2').toString('base64')}`;

after(() => temporaryStorageRoots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function setup(options: {
  listModels?: NonNullable<ProviderAdapter['listModels']>;
  generateText?: NonNullable<ProviderAdapter['generateText']>;
  submitImage?: NonNullable<ProviderAdapter['submitImage']>;
  submitVideo?: NonNullable<ProviderAdapter['submitVideo']>;
  logger?: Logger;
} = {}) {
  const db = new Database(':memory:');
  initializeDatabase(db);
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-ai-drama-test-'));
  temporaryStorageRoots.push(storageRoot);
  const testConfig: AppConfig = { ...config, storage: { ...config.storage, local_path: storageRoot } };
  const registry = new ProviderRegistry();
  registry.register({
    descriptor: {
      id: 'agnes',
      label: 'Agnes test',
      aliases: [],
      capabilities: {
        text: true,
        textToImage: true,
        imageToImage: true,
        textToVideo: true,
        imageToVideo: true,
        asynchronous: false,
        multipleImageReferences: true,
        firstLastFrame: true,
      },
    },
    listModels: options.listModels ?? (async () => [
      { id: 'agnes-text', label: 'Agnes Text', kind: 'text', capabilities: modelCapabilities([], null, [], 'adapter') },
      { id: 'agnes-image', label: 'Agnes Image', kind: 'image', capabilities: modelCapabilities(['text-to-image', 'image-to-image'], 2, ['1:1', '9:16'], 'adapter') },
      { id: 'agnes-image-text-only', label: 'Agnes Image Text Only', kind: 'image', capabilities: modelCapabilities(['text-to-image'], 0, ['1:1', '9:16'], 'adapter') },
      { id: 'agnes-video', label: 'Agnes Video', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 1, ['16:9', '9:16'], 'adapter', 'duration') },
      { id: 'agnes-video-flash', label: 'Agnes Video Flash', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 1, ['16:9', '9:16'], 'adapter', 'duration') },
      { id: 'agnes-video-per-request', label: 'Agnes Video Per Request', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 1, ['16:9', '9:16'], 'adapter', 'per-request') },
      { id: 'agnes-video-per-request-duration', label: 'Agnes Video Per Request With Duration', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 1, ['16:9', '9:16'], 'adapter', 'per-request', [4, 6, 8, 10, 12, 15]) },
    ]),
    generateText: options.generateText ?? (async (_context, request) => {
      const system = request.messages.find((message) => message.role === 'system')?.content || '';
      return {
        status: 'completed',
        text: request.jsonMode
          ? system.includes('分镜')
            ? JSON.stringify({ items: [1, 2, 3, 4].map((index) => ({ title: `分镜 ${index}`, description: `画面 ${index}` })) })
            : JSON.stringify({ items: [{ name: '林夏', description: '调查员', appearance: '短发，黑色风衣' }] })
          : '第一场：林夏走进车站。',
      };
    }),
    submitImage: options.submitImage ?? (async (_context, request) => ({
      status: 'completed',
      imageUrl: TEST_PNG,
    })),
    submitVideo: options.submitVideo ?? (async (_context, request) => ({
      status: 'completed',
      videoUrl: TEST_MP4,
    })),
  });
  const services = createServices(db, testConfig, registry, options.logger ?? log);
  return { db, services, storageRoot };
}

async function taskDone(get: () => { status: string; error: string | null } | undefined): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const task = get();
    if (task?.status === 'completed') return;
    if (task?.status === 'failed') throw new Error(task.error ?? 'task failed');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('task did not finish');
}

function submittedTaskId(submission: { task_id?: string }): string {
  assert.ok(submission.task_id);
  return submission.task_id;
}

test('项目、剧集和画布布局使用同一项目服务持久化', () => {
  const { db, services } = setup();
  try {
    const project = services.projects.create({ title: '测试短剧', metadata: {} });
    const episodes = services.projects.saveEpisodes(project.id, [{ episode_number: 1, title: '第一集', script_content: '' }]);
    const firstSave = services.projects.saveCanvas(
      project.id,
      { workspace_nodes: [{ id: 'text-1' }], edges: [], workflow_groups: [{ id: 'group-1' }] },
      project.canvas_revision,
    );
    const saved = services.projects.require(project.id);
    assert.equal(episodes.length, 1);
    assert.equal(firstSave.canvas_revision, 1);
    assert.deepEqual(saved.metadata.canvas_layout, {
      workspace_nodes: [{ id: 'text-1' }],
      edges: [],
      workflow_groups: [{ id: 'group-1' }],
    });
    assert.throws(
      () => services.projects.saveCanvas(
        project.id,
        { workspace_nodes: [{ id: 'stale-node' }], edges: [], workflow_groups: [] },
        project.canvas_revision,
      ),
      (error: unknown) => error instanceof Error
        && error.name === 'ConflictError'
        && /画布已被其他页面更新/u.test(error.message),
    );
    assert.deepEqual(
      services.projects.require(project.id).metadata.canvas_layout,
      { workspace_nodes: [{ id: 'text-1' }], edges: [], workflow_groups: [{ id: 'group-1' }] },
    );
    assert.throws(
      () => services.projects.saveCanvas(project.id, { workspace_nodes: [] }, firstSave.canvas_revision),
      /canvas_layout 必须包含 workspace_nodes、edges 和 workflow_groups 数组/u,
    );
  } finally { db.close(); }
});

test('新项目自动建立起步剧集并支持更新与级联删除', () => {
  const { db, services } = setup();
  try {
    const project = services.projects.create({ title: '自动初始化测试' });
    assert.equal(project.episodes?.length, 1);
    assert.equal(project.episodes?.[0]?.episode_number, 1);
    assert.equal(project.episodes?.[0]?.title, '第 1 集');
    assert.equal(services.projects.update(project.id, { title: '已重命名项目' }).title, '已重命名项目');
    assert.equal(services.projects.remove(project.id), true);
    assert.equal(services.projects.get(project.id), undefined);
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM episodes WHERE drama_id = ?').get(project.id) as { total: number }).total, 0);
    assert.equal(services.projects.remove(project.id), false);
  } finally { db.close(); }
});

test('项目归档可由当前 schema 导出并重新导入', async () => {
  const { db, services, storageRoot } = setup();
  try {
    const project = services.projects.create({ title: '归档测试', metadata: { source: 'test' } });
    services.projects.saveEpisodes(project.id, [{ episode_number: 1, title: '第一集', script_content: '归档剧本' }]);
    const archivePath = path.join(storageRoot, 'project-import.zip');
    await services.projectArchives.export(project.id, archivePath);
    const imported = await services.projectArchives.import(archivePath);
    assert.equal(imported.title, '归档测试');
    assert.equal(imported.episodes?.[0]?.script_content, '归档剧本');
    assert.deepEqual(imported.metadata, { source: 'test' });
  } finally { db.close(); }
});

test('配置服务从根配置读取供应商并保存动态模型快照', async () => {
  const auditEvents: string[] = [];
  const { db, services } = setup({
    logger: { info() {}, warn() {}, error() {}, audit(event) { auditEvents.push(event); } },
  });
  try {
    assert.equal(services.aiConfigs.providers().find((item) => item.id === 'agnes')?.configured, true);
    await services.aiConfigs.refresh('agnes');
    assert.deepEqual(
      services.aiConfigs.models('agnes', 'image').map((item) => item.id),
      ['agnes-image', 'agnes-image-text-only'],
    );
    assert.deepEqual(
      services.aiConfigs.models('agnes', 'image')[0]?.capabilities,
      modelCapabilities(['text-to-image', 'image-to-image'], 2, ['1:1', '9:16'], 'adapter'),
    );
    assert.deepEqual(services.aiConfigs.presets(), { text: null, image: null, video: null });
    assert.equal(services.aiConfigs.select('video', 'agnes').default_model, 'agnes-video');
    assert.deepEqual(services.aiConfigs.savePresets({
      text: { provider: 'agnes', model: 'agnes-text' },
      image: { provider: 'agnes', model: 'agnes-image-text-only' },
      video: { provider: 'agnes', model: 'agnes-video' },
    }), {
      text: { provider: 'agnes', model: 'agnes-text' },
      image: { provider: 'agnes', model: 'agnes-image-text-only' },
      video: { provider: 'agnes', model: 'agnes-video' },
    });
    assert.deepEqual(auditEvents, ['ai.model-presets.updated']);
    assert.equal(services.aiConfigs.select('video').default_model, 'agnes-video');
    assert.equal(services.aiConfigs.select('video', 'agnes', 'agnes-video-flash').default_model, 'agnes-video-flash');
    assert.throws(
      () => services.aiConfigs.select('image', undefined, undefined, { mode: 'image-to-image' }),
      /Agnes Image Text Only 不支持图生图/u,
    );
    assert.throws(() => services.aiConfigs.savePresets({
      text: null,
      image: { provider: 'agnes', model: 'agnes-text' },
      video: null,
    }), /没有图片模型/u);
    services.aiConfigs.savePresets({ text: null, image: null, video: null });
    assert.equal(services.aiConfigs.select('image', undefined, undefined, { mode: 'image-to-image' }).default_model, 'agnes-image');
    assert.equal(services.aiConfigs.select('video', 'agnes').default_model, 'agnes-video');
    await assert.rejects(services.aiConfigs.refresh('unknown'), /供应商未注册/u);
  } finally { db.close(); }
});

test('模型能力未知时固定显式选择和全局预设，仅明确冲突才拒绝', async () => {
  const submitted: Array<{ model: string; aspectRatio?: string }> = [];
  const { db, services } = setup({
    listModels: async () => [
      { id: 'gpt-image-2', label: 'A GPT Image 2', kind: 'image', capabilities: modelCapabilities([], null, null, 'provider') },
      { id: 'known-image', label: 'Z Known Image', kind: 'image', capabilities: modelCapabilities(['text-to-image', 'image-to-image'], 4, ['1:1', '9:16'], 'provider') },
      { id: 'limited-image', label: 'Limited Image', kind: 'image', capabilities: modelCapabilities(['text-to-image'], 0, ['1:1'], 'provider') },
    ],
    submitImage: async (_context, request) => {
      submitted.push({ model: request.model, aspectRatio: request.aspectRatio });
      return { status: 'completed', imageUrl: TEST_PNG };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const requirements = {
      mode: 'image-to-image' as const,
      referenceImageCount: 3,
      aspectRatio: '9:16',
      requiresAspectRatio: true,
    };

    assert.equal(services.aiConfigs.select('image', 'agnes', 'gpt-image-2', requirements).default_model, 'gpt-image-2');
    assert.equal(services.aiConfigs.resolveAspectRatio('image', 'agnes', 'gpt-image-2', '9:16'), '9:16');

    services.aiConfigs.savePresets({ text: null, image: { provider: 'agnes', model: 'gpt-image-2' }, video: null });
    assert.equal(services.aiConfigs.select('image', undefined, undefined, requirements).default_model, 'gpt-image-2');

    const project = services.projects.create({ title: '未知能力模型透传' });
    const taskId = submittedTaskId(services.production.execute({
      kind: 'image', projectId: project.id, mode: 'text-to-image', prompt: '竖屏画面',
      provider: 'agnes', model: 'gpt-image-2', aspectRatio: '9:16', referenceImages: [],
    }));
    await taskDone(() => services.tasks.get(taskId));
    assert.deepEqual(submitted, [{ model: 'gpt-image-2', aspectRatio: '9:16' }]);

    services.aiConfigs.savePresets({ text: null, image: null, video: null });
    assert.equal(services.aiConfigs.select('image', undefined, undefined, requirements).default_model, 'known-image');
    assert.throws(
      () => services.aiConfigs.select('image', 'agnes', 'limited-image', requirements),
      /不支持图生图|最多支持 0 张参考图|不支持画幅比例 9:16/u,
    );

    db.prepare("DELETE FROM provider_model_catalog WHERE provider = 'agnes' AND model_id != 'gpt-image-2'").run();
    assert.equal(services.aiConfigs.select('image', undefined, undefined, requirements).default_model, 'gpt-image-2');
  } finally { db.close(); }
});

test('文本、四种媒体模式通过统一任务主链完成', async () => {
  const { db, services } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '测试短剧' });
    const episode = services.projects.saveEpisodes(project.id, [{ episode_number: 1, title: '第一集', script_content: '' }])[0];
    assert.ok(episode);

    const textSubmission = services.production.execute({
      kind: 'ai-text', projectId: project.id, episodeId: episode.id,
      action: 'write-script', sourceText: '雨夜重逢',
    });
    const textTask = submittedTaskId(textSubmission);
    await taskDone(() => services.tasks.get(textTask));
    assert.equal(services.tasks.get(textTask)?.result?.provider, 'agnes');
    assert.equal(services.tasks.get(textTask)?.result?.model, 'agnes-text');
    assert.match(services.projects.require(project.id).episodes?.[0]?.script_content ?? '', /车站/u);

    const storyboardTask = submittedTaskId(services.production.execute({
      kind: 'ai-text', projectId: project.id, episodeId: episode.id,
      action: 'split-storyboards', sourceText: '雨夜车站剧本', storyboardCount: 3,
    }));
    await taskDone(() => services.tasks.get(storyboardTask));
    assert.equal(services.assets.listStoryboards(episode.id).length, 3);

    const textImageSubmission = services.production.execute({
      kind: 'image', projectId: project.id, mode: 'text-to-image',
      prompt: '雨夜车站', referenceImages: [],
    });
    assert.deepEqual(textImageSubmission.result, { provider: 'agnes', model: 'agnes-image' });
    const textImageTask = submittedTaskId(textImageSubmission);
    const imageImageTask = submittedTaskId(services.production.execute({
      kind: 'image', projectId: project.id, mode: 'image-to-image',
      prompt: '保持人物一致', referenceImages: ['https://cdn.test/ref.png'],
    }));
    await Promise.all([
      taskDone(() => services.tasks.get(textImageTask)),
      taskDone(() => services.tasks.get(imageImageTask)),
    ]);
    const images = services.images.list(project.id);
    assert.equal(images.find((item) => item.prompt === '雨夜车站')?.image_url, '/static/projects/1/images/1.png');
    assert.equal(images.find((item) => item.prompt === '保持人物一致')?.image_url, '/static/projects/1/images/2.png');

    const textVideoTask = submittedTaskId(services.production.execute({
      kind: 'video', projectId: project.id, mode: 'text-to-video',
      prompt: '镜头推进', referenceImages: [],
    }));
    const imageVideoTask = submittedTaskId(services.production.execute({
      kind: 'video', projectId: project.id, mode: 'image-to-video',
      prompt: '人物转身', referenceImages: ['https://cdn.test/start.png'],
    }));
    await Promise.all([
      taskDone(() => services.tasks.get(textVideoTask)),
      taskDone(() => services.tasks.get(imageVideoTask)),
    ]);
    const videos = services.videos.list(project.id);
    assert.equal(videos.find((item) => item.prompt === '镜头推进')?.video_url, '/static/projects/1/videos/1.mp4');
    assert.equal(videos.find((item) => item.prompt === '人物转身')?.video_url, '/static/projects/1/videos/2.mp4');
  } finally { db.close(); }
});

test('供应商成功但本地媒体归档失败时明确失败且不更新资产', async () => {
  const { db, services } = setup({
    submitImage: async () => ({ status: 'completed', imageUrl: 'file:///not-a-provider-media.png' }),
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '归档失败测试' });
    const [character] = services.assets.syncCharacters(project.id, [{ name: '小林', appearance: '黄色外卖服' }]);
    assert.ok(character);
    const row = services.images.create({
      dramaId: project.id,
      characterId: character.id,
      prompt: '角色标准照',
      provider: 'agnes',
      model: 'agnes-image',
      aspectRatio: '9:16',
      referenceImages: [],
    });
    assert.ok(row.task_id);
    for (let attempt = 0; attempt < 100 && services.tasks.get(row.task_id)?.status !== 'failed'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const failed = services.images.get(row.id);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.failure_stage, 'archive');
    assert.match(failed?.error_msg || '', /本地归档失败/u);
    assert.equal(services.assets.getCharacter(character.id)?.image_url, null);
    assert.equal(services.assets.getCharacter(character.id)?.current_image_generation_id, null);
  } finally { db.close(); }
});

test('媒体生成历史全部保留并可重新选用旧版本', async () => {
  const { db, services, storageRoot } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '历史版本测试' });
    const [character] = services.assets.syncCharacters(project.id, [{ name: '苏晴', appearance: '白色西装' }]);
    assert.ok(character);
    const first = services.images.create({ dramaId: project.id, characterId: character.id, prompt: '版本一', provider: 'agnes', model: 'agnes-image', aspectRatio: '9:16', referenceImages: [] });
    assert.ok(first.task_id);
    await taskDone(() => services.tasks.get(first.task_id as string));
    const second = services.images.create({ dramaId: project.id, characterId: character.id, prompt: '版本二', provider: 'agnes', model: 'agnes-image', aspectRatio: '9:16', referenceImages: [] });
    assert.ok(second.task_id);
    await taskDone(() => services.tasks.get(second.task_id as string));

    const history = services.images.list(project.id);
    const firstCompleted = services.images.get(first.id);
    assert.equal(history.length, 2);
    assert.ok(history.every((item) => item.status === 'completed' && item.source_url === TEST_PNG && item.local_path));
    assert.ok(history.every((item) => fs.existsSync(path.join(storageRoot, item.local_path as string))));
    assert.equal(services.assets.getCharacter(character.id)?.current_image_generation_id, second.id);
    services.images.select(first.id);
    assert.equal(services.assets.getCharacter(character.id)?.current_image_generation_id, first.id);
    assert.equal(services.assets.getCharacter(character.id)?.image_url, firstCompleted?.image_url);

    const regeneratedTask = submittedTaskId(services.production.execute({
      kind: 'image', projectId: project.id, mode: 'image-to-image', prompt: '沿用已选历史版本继续生成',
      referenceImages: [firstCompleted?.image_url as string], target: { kind: 'character', id: character.id },
    }));
    await taskDone(() => services.tasks.get(regeneratedTask));
    const regenerated = services.images.list(project.id).find((item) => item.prompt === '沿用已选历史版本继续生成');
    assert.deepEqual(JSON.parse(regenerated?.reference_images || '[]'), [firstCompleted?.image_url]);
    assert.ok(regenerated?.local_path);
    assert.equal(services.projects.require(project.id).media_lifecycle?.images[String(regenerated.id)]?.available, true);
    fs.rmSync(path.join(storageRoot, regenerated.local_path));
    assert.equal(services.projects.require(project.id).media_lifecycle?.images[String(regenerated.id)]?.available, false);
    assert.throws(() => services.images.select(regenerated.id), /本地文件真实存在/u);
  } finally { db.close(); }
});

test('整集合成历史可以重新选为剧集当前版本', () => {
  const { db, services, storageRoot } = setup();
  try {
    const project = services.projects.create({ title: '成片版本测试' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO video_generations (
        drama_id, episode_id, provider, prompt, reference_image_urls, video_url, local_path,
        media_type, file_size, status, created_at, updated_at, completed_at
      ) VALUES (?, ?, 'local-composition', ?, '[]', ?, ?, 'video/mp4', 24, 'completed', ?, ?, ?)
    `);
    const first = Number(insert.run(project.id, episode.id, '版本一', '/static/projects/1/videos/101.mp4', 'projects/1/videos/101.mp4', now, now, now).lastInsertRowid);
    const second = Number(insert.run(project.id, episode.id, '版本二', '/static/projects/1/videos/102.mp4', 'projects/1/videos/102.mp4', now, now, now).lastInsertRowid);
    const bytes = Buffer.from(TEST_MP4.split(',')[1] as string, 'base64');
    for (const relative of ['projects/1/videos/101.mp4', 'projects/1/videos/102.mp4']) {
      const destination = path.join(storageRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes);
    }
    services.videos.select(second);
    services.videos.select(first);
    const selected = services.projects.require(project.id).episodes?.[0];
    assert.equal(selected?.current_video_generation_id, first);
    assert.equal(selected?.video_url, '/static/projects/1/videos/101.mp4');
    assert.equal(services.videos.list(project.id).length, 2);
  } finally { db.close(); }
});

test('项目归档携带本地媒体和历史，导入后不依赖供应商链接', async () => {
  const { db, services, storageRoot } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '带媒体归档测试' });
    const [character] = services.assets.syncCharacters(project.id, [{ name: '小林', appearance: '黄色外卖服' }]);
    assert.ok(character);
    const generated = services.images.create({ dramaId: project.id, characterId: character.id, prompt: '本地标准照', provider: 'agnes', model: 'agnes-image', aspectRatio: '9:16', referenceImages: [] });
    assert.ok(generated.task_id);
    await taskDone(() => services.tasks.get(generated.task_id as string));
    const episode = services.projects.require(project.id).episodes?.[0];
    assert.ok(episode);
    const now = new Date().toISOString();
    const composed = db.prepare(`
      INSERT INTO video_generations (
        drama_id, episode_id, provider, prompt, model, reference_image_urls, status, created_at, updated_at, completed_at
      ) VALUES (?, ?, 'local-composition', '整集合成', 'ffmpeg-concat-copy', '[]', 'completed', ?, ?, ?)
    `).run(project.id, episode.id, now, now, now);
    const composedId = Number(composed.lastInsertRowid);
    const composedPath = `projects/${project.id}/videos/${composedId}.mp4`;
    const composedUrl = `/static/${composedPath}`;
    fs.mkdirSync(path.join(storageRoot, path.dirname(composedPath)), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, composedPath), Buffer.from(TEST_MP4.split(',')[1] as string, 'base64'));
    db.prepare(`UPDATE video_generations SET video_url = ?, local_path = ?, media_type = 'video/mp4', file_size = ? WHERE id = ?`)
      .run(composedUrl, composedPath, fs.statSync(path.join(storageRoot, composedPath)).size, composedId);
    db.prepare('UPDATE episodes SET video_url = ?, current_video_generation_id = ? WHERE id = ?').run(composedUrl, composedId, episode.id);
    services.projects.saveCanvas(project.id, {
      workspace_nodes: [{
        id: 'compose',
        data: {
          role: 'episode-compose',
          assetRefs: { episodes: [episode.id] },
          result: { outputUrl: composedUrl, generationId: composedId, assetRefs: { episodes: [episode.id] } },
          history: [{ outputUrl: composedUrl, generationId: composedId, assetRefs: { episodes: [episode.id] } }],
        },
      }],
      edges: [],
      workflow_groups: [{ id: 'workflow', nodeIds: ['compose'] }],
    }, project.canvas_revision);

    const archivePath = path.join(storageRoot, 'project-with-media.zip');
    await services.projectArchives.export(project.id, archivePath);
    const exportedArchive = await unzipper.Open.file(archivePath);
    const manifestEntry = exportedArchive.files.find((entry) => entry.path === 'project.json');
    assert.ok(manifestEntry);
    const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8')) as { project?: { media_lifecycle?: unknown } };
    assert.equal(manifest.project?.media_lifecycle, undefined);
    const imported = await services.projectArchives.import(archivePath);
    const importedHistory = services.images.list(imported.id);
    assert.equal(importedHistory.length, 1);
    assert.match(importedHistory[0]?.image_url || '', /^\/static\/projects\//u);
    assert.equal(importedHistory[0]?.source_url, TEST_PNG);
    assert.ok(fs.existsSync(path.join(storageRoot, importedHistory[0]?.local_path as string)));
    assert.equal(imported.characters?.[0]?.current_image_generation_id, importedHistory[0]?.id);
    assert.equal(imported.characters?.[0]?.image_url, importedHistory[0]?.image_url);
    const importedVideos = services.videos.list(imported.id);
    const importedComposition = importedVideos.find((item) => item.episode_id === imported.episodes?.[0]?.id);
    assert.ok(importedComposition?.local_path);
    assert.ok(fs.existsSync(path.join(storageRoot, importedComposition.local_path)));
    assert.equal(imported.episodes?.[0]?.current_video_generation_id, importedComposition.id);
    assert.equal(imported.episodes?.[0]?.video_url, importedComposition.video_url);
    const layout = imported.metadata.canvas_layout as { workspace_nodes: Array<{ data: { assetRefs: { episodes: number[] }; result: { outputUrl: string; generationId: number }; history: Array<{ outputUrl: string; generationId: number }> } }> };
    const composeNode = layout.workspace_nodes[0]?.data;
    assert.deepEqual(composeNode?.assetRefs.episodes, [imported.episodes?.[0]?.id]);
    assert.equal(composeNode?.result.generationId, importedComposition.id);
    assert.equal(composeNode?.result.outputUrl, importedComposition.video_url);
    assert.equal(composeNode?.history[0]?.generationId, importedComposition.id);
    assert.equal(composeNode?.history[0]?.outputUrl, importedComposition.video_url);
  } finally { db.close(); }
});

test('默认系统提示词公开且用户覆盖值真实到达文本供应商', async () => {
  let receivedSystem = '';
  const { db, services } = setup({
    generateText: async (_context, request) => {
      receivedSystem = request.messages.find((message) => message.role === 'system')?.content || '';
      return { status: 'completed', text: '自定义提示词生成的剧本' };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const prompts = services.production.textPrompts();
    assert.deepEqual(prompts.map((item) => item.key), [
      'generate-text', 'write-script', 'extract-characters', 'extract-scenes', 'extract-props', 'split-storyboards',
    ]);
    assert.ok(prompts.every((item) => item.system_prompt.length > 20));

    const project = services.projects.create({ title: '提示词覆盖测试' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const taskId = submittedTaskId(services.production.execute({
      kind: 'ai-text', projectId: project.id,
      episodeId: episode.id,
      action: 'write-script', sourceText: '雨夜重逢',
      systemPrompt: '这是用户在画布中完整编辑的系统提示词。',
      provider: 'agnes',
      model: 'agnes-text',
    }));
    await taskDone(() => services.tasks.get(taskId));
    assert.equal(receivedSystem, '这是用户在画布中完整编辑的系统提示词。');
  } finally { db.close(); }
});

test('分镜生成可直接消费画布传来的手动剧本', async () => {
  const { db, services } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '手动剧本分镜测试' });
    const episode = project.episodes?.[0];
    assert.ok(episode);

    const taskId = submittedTaskId(services.production.execute({
      kind: 'ai-text', projectId: project.id, episodeId: episode.id,
      action: 'split-storyboards',
      sourceText: '第一场：雨夜车站，主角推门进入。',
      storyboardCount: 3,
      provider: 'agnes',
      model: 'agnes-text',
    }));
    await taskDone(() => services.tasks.get(taskId));

    assert.equal(services.assets.listStoryboards(episode.id).length, 3);
  } finally { db.close(); }
});

test('取消文本任务后即使供应商稍后返回也不再写回剧本', async () => {
  let releaseProvider: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const providerStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const { db, services } = setup({
    generateText: async () => {
      markStarted?.();
      await providerGate;
      return { status: 'completed', text: '这段内容不应写入数据库' };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '取消测试' });
    const episode = services.projects.saveEpisodes(project.id, [{
      episode_number: 1,
      title: '第一集',
      script_content: '取消前的剧本',
    }])[0];
    assert.ok(episode);

    const taskId = submittedTaskId(services.production.execute({
      kind: 'ai-text', projectId: project.id,
      episodeId: episode.id,
      action: 'write-script', sourceText: '不会落库',
      provider: 'agnes',
      model: 'agnes-text',
    }));
    await providerStarted;
    assert.equal(services.tasks.cancel(taskId)?.status, 'cancelled');
    releaseProvider?.();
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(services.tasks.get(taskId)?.status, 'cancelled');
    assert.equal(services.projects.require(project.id).episodes?.[0]?.script_content, '取消前的剧本');
  } finally { db.close(); }
});

test('媒体任务在创建前校验模型模式和参考图上限', async () => {
  const { db, services } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '模型能力校验' });
    assert.throws(
      () => services.images.create({
        dramaId: project.id,
        prompt: '超出参考图上限',
        model: 'agnes-image',
        referenceImages: ['https://cdn.test/1.png', 'https://cdn.test/2.png', 'https://cdn.test/3.png'],
      }),
      /最多支持 2 张参考图，当前为 3 张/u,
    );
    assert.throws(
      () => services.images.create({
        dramaId: project.id,
        prompt: '不兼容模式',
        model: 'agnes-image-text-only',
        referenceImages: ['https://cdn.test/1.png'],
      }),
      /不支持图生图/u,
    );
    assert.throws(
      () => services.videos.create({
        dramaId: project.id,
        prompt: '图生视频',
        model: 'agnes-video',
        firstFrame: 'https://cdn.test/1.png',
        lastFrame: 'https://cdn.test/2.png',
        referenceImages: [],
      }),
      /最多支持 1 张参考图，当前为 2 张/u,
    );
    assert.throws(
      () => services.images.create({
        dramaId: project.id,
        prompt: '不支持的宽画幅',
        model: 'agnes-image',
        aspectRatio: '21:9',
        referenceImages: [],
      }),
      /不支持画幅比例 21:9/u,
    );
    assert.equal(services.images.list(project.id).length, 0);
    assert.equal(services.videos.list(project.id).length, 0);
  } finally { db.close(); }
});

test('视频服务按独立时长能力传参，不把按次计费误判为不支持时长', async () => {
  const receivedDurations: Array<number | undefined> = [];
  const { db, services } = setup({
    submitVideo: async (_context, request) => {
      receivedDurations.push(request.duration);
      return { status: 'completed', videoUrl: TEST_MP4 };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '视频计费方式' });
    const taskId = submittedTaskId(services.production.execute({
      kind: 'video', projectId: project.id, mode: 'text-to-video', prompt: '按次视频',
      duration: 8, provider: 'agnes', model: 'agnes-video-per-request', aspectRatio: '16:9', referenceImages: [],
    }));
    await taskDone(() => services.tasks.get(taskId));
    assert.equal(receivedDurations[0], undefined);
    assert.equal(services.videos.list(project.id).find((row) => row.model === 'agnes-video-per-request')?.duration, null);

    const durationTaskId = submittedTaskId(services.production.execute({
      kind: 'video', projectId: project.id, mode: 'text-to-video', prompt: '按次但支持时长的视频',
      duration: 15, provider: 'agnes', model: 'agnes-video-per-request-duration', aspectRatio: '16:9', referenceImages: [],
    }));
    await taskDone(() => services.tasks.get(durationTaskId));
    assert.equal(receivedDurations[1], 15);
    assert.equal(services.videos.list(project.id).find((row) => row.model === 'agnes-video-per-request-duration')?.duration, 15);
  } finally { db.close(); }
});

test('分镜图以直接连线传入的参考图为准，不额外混入仓库中的其他资产图', async () => {
  let receivedReferences: string[] = [];
  const { db, services } = setup({
    submitImage: async (_context, request) => {
      receivedReferences = request.referenceImages;
      return { status: 'completed', imageUrl: TEST_PNG };
    },
  });
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '连线参考图测试' });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const [character] = services.assets.syncCharacters(project.id, [{ name: '小林', appearance: '黄色外卖服' }]);
    assert.ok(character);
    db.prepare('UPDATE characters SET image_url = ? WHERE id = ?').run('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', character.id);
    const [storyboard] = services.assets.syncStoryboards(episode.id, [{
      title: '镜头一', image_prompt: '雨夜骑行', character_ids: [character.id],
    }]);
    assert.ok(storyboard);
    const taskId = submittedTaskId(services.production.execute({
      kind: 'image', projectId: project.id, mode: 'image-to-image', prompt: '只使用连线参考图',
      referenceImages: [TEST_PNG], target: { kind: 'storyboard', id: storyboard.id }, provider: 'agnes', model: 'agnes-image', aspectRatio: '9:16',
    }));
    await taskDone(() => services.tasks.get(taskId));
    assert.deepEqual(receivedReferences, [TEST_PNG]);
  } finally { db.close(); }
});

test('全新数据库 schema 直接包含模型能力列', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const columns = db.prepare('PRAGMA table_info(provider_model_catalog)').all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === 'capabilities'));
    const projectColumns = db.prepare('PRAGMA table_info(dramas)').all() as Array<{ name: string }>;
    assert.ok(projectColumns.some((column) => column.name === 'canvas_revision'));
    const presetColumns = db.prepare('PRAGMA table_info(ai_model_presets)').all() as Array<{ name: string }>;
    assert.deepEqual(presetColumns.map((column) => column.name), ['service_type', 'provider', 'model_id', 'updated_at']);
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM provider_model_catalog').get() as { total: number }).total, 0);
  } finally { db.close(); }
});
