import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { modelCapabilities, ProviderRegistry, type ProviderAdapter } from '../src/providers';
import { createServices } from '../src/services/container';
import type { AppConfig, Logger } from '../src/types/core';

const config: AppConfig = {
  app: { name: 'test', version: '1' },
  server: {},
  database: { path: ':memory:' },
  storage: { local_path: './data/test-storage', base_url: 'http://localhost:5679/static' },
  video: { generation_timeout_minutes: 1 },
  ai: {
    providers: {
      agnes: {
        enabled: true,
        base_url: 'https://api.test',
        api_key: 'secret',
        default_models: { video: 'agnes-video-flash' },
      },
      pearapi: { enabled: true, base_url: 'https://pear.test', api_key: '' },
    },
  },
};
const log: Logger = { info() {}, warn() {}, error() {} };

function setup(options: { generateText?: NonNullable<ProviderAdapter['generateText']> } = {}) {
  const db = new Database(':memory:');
  initializeDatabase(db);
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
    listModels: async () => [
      { id: 'agnes-text', label: 'Agnes Text', kind: 'text', capabilities: modelCapabilities([], null, [], 'adapter') },
      { id: 'agnes-image', label: 'Agnes Image', kind: 'image', capabilities: modelCapabilities(['text-to-image', 'image-to-image'], 2, ['1:1', '9:16'], 'adapter') },
      { id: 'agnes-image-text-only', label: 'Agnes Image Text Only', kind: 'image', capabilities: modelCapabilities(['text-to-image'], 0, ['1:1', '9:16'], 'adapter') },
      { id: 'agnes-video', label: 'Agnes Video', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 1, ['16:9', '9:16'], 'adapter') },
      { id: 'agnes-video-flash', label: 'Agnes Video Flash', kind: 'video', capabilities: modelCapabilities(['text-to-video', 'image-to-video'], 1, ['16:9', '9:16'], 'adapter') },
    ],
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
    submitImage: async (_context, request) => ({
      status: 'completed',
      imageUrl: request.referenceImages.length
        ? 'https://cdn.test/image-to-image.png'
        : 'https://cdn.test/text-to-image.png',
    }),
    submitVideo: async (_context, request) => ({
      status: 'completed',
      videoUrl: request.image || request.firstFrame
        ? 'https://cdn.test/image-to-video.mp4'
        : 'https://cdn.test/text-to-video.mp4',
    }),
  });
  const services = createServices(db, config, registry, log);
  return { db, services };
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

test('项目归档可由当前 schema 导出并重新导入', () => {
  const { db, services } = setup();
  try {
    const project = services.projects.create({ title: '归档测试', metadata: { source: 'test' } });
    services.projects.saveEpisodes(project.id, [{ episode_number: 1, title: '第一集', script_content: '归档剧本' }]);
    const archive = services.projectArchives.export(project.id);
    const imported = services.projectArchives.import(archive);
    assert.equal(imported.title, '归档测试');
    assert.equal(imported.episodes?.[0]?.script_content, '归档剧本');
    assert.deepEqual(imported.metadata, { source: 'test' });
  } finally { db.close(); }
});

test('配置服务从根配置读取供应商并保存动态模型快照', async () => {
  const { db, services } = setup();
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
    assert.equal(services.aiConfigs.select('video', 'agnes').default_model, 'agnes-video-flash');
    await assert.rejects(services.aiConfigs.refresh('unknown'), /供应商未注册/u);
  } finally { db.close(); }
});

test('文本、四种媒体模式通过统一任务主链完成', async () => {
  const { db, services } = setup();
  try {
    await services.aiConfigs.refresh('agnes');
    const project = services.projects.create({ title: '测试短剧' });
    const episode = services.projects.saveEpisodes(project.id, [{ episode_number: 1, title: '第一集', script_content: '' }])[0];
    assert.ok(episode);

    const textTask = submittedTaskId(services.production.execute({
      kind: 'ai-text', projectId: project.id, episodeId: episode.id,
      action: 'write-script', sourceText: '雨夜重逢',
    }));
    await taskDone(() => services.tasks.get(textTask));
    assert.match(services.projects.require(project.id).episodes?.[0]?.script_content ?? '', /车站/u);

    const storyboardTask = submittedTaskId(services.production.execute({
      kind: 'ai-text', projectId: project.id, episodeId: episode.id,
      action: 'split-storyboards', sourceText: '雨夜车站剧本', storyboardCount: 3,
    }));
    await taskDone(() => services.tasks.get(storyboardTask));
    assert.equal(services.storyboards.list(episode.id).length, 3);

    const textImageTask = submittedTaskId(services.production.execute({
      kind: 'image', projectId: project.id, mode: 'text-to-image',
      prompt: '雨夜车站', referenceImages: [],
    }));
    const imageImageTask = submittedTaskId(services.production.execute({
      kind: 'image', projectId: project.id, mode: 'image-to-image',
      prompt: '保持人物一致', referenceImages: ['https://cdn.test/ref.png'],
    }));
    await Promise.all([
      taskDone(() => services.tasks.get(textImageTask)),
      taskDone(() => services.tasks.get(imageImageTask)),
    ]);
    const images = services.images.list(project.id);
    assert.equal(images.find((item) => item.prompt === '雨夜车站')?.image_url, 'https://cdn.test/text-to-image.png');
    assert.equal(images.find((item) => item.prompt === '保持人物一致')?.image_url, 'https://cdn.test/image-to-image.png');

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
    assert.equal(videos.find((item) => item.prompt === '镜头推进')?.video_url, 'https://cdn.test/text-to-video.mp4');
    assert.equal(videos.find((item) => item.prompt === '人物转身')?.video_url, 'https://cdn.test/image-to-video.mp4');
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

    assert.equal(services.storyboards.list(episode.id).length, 3);
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

test('全新数据库 schema 直接包含模型能力列', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const columns = db.prepare('PRAGMA table_info(provider_model_catalog)').all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === 'capabilities'));
    const projectColumns = db.prepare('PRAGMA table_info(dramas)').all() as Array<{ name: string }>;
    assert.ok(projectColumns.some((column) => column.name === 'canvas_revision'));
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM provider_model_catalog').get() as { total: number }).total, 0);
  } finally { db.close(); }
});
