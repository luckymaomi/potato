import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../src/db/migrate';
import { ProviderRegistry } from '../src/providers';
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

function setup() {
  const db = new Database(':memory:');
  migrate(db);
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
      { id: 'agnes-text', label: 'Agnes Text', kind: 'text' },
      { id: 'agnes-image', label: 'Agnes Image', kind: 'image' },
      { id: 'agnes-video', label: 'Agnes Video', kind: 'video' },
      { id: 'agnes-video-flash', label: 'Agnes Video Flash', kind: 'video' },
    ],
    generateText: async (_context, request) => ({
      status: 'completed',
      text: request.jsonMode
        ? JSON.stringify({ items: [{ name: '林夏', description: '调查员', appearance: '短发，黑色风衣' }] })
        : '第一场：林夏走进车站。',
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

test('项目、剧集和画布布局使用同一项目服务持久化', () => {
  const { db, services } = setup();
  try {
    const project = services.projects.create({ title: '测试短剧', metadata: {} });
    const episodes = services.projects.saveEpisodes(project.id, [{ episode_number: 1, title: '第一集', script_content: '' }]);
    services.projects.saveCanvas(project.id, { workspace_nodes: [{ id: 'text-1' }], edges: [] }, [{ id: 'group-1' }]);
    const saved = services.projects.require(project.id);
    assert.equal(episodes.length, 1);
    assert.deepEqual(saved.metadata.canvas_layout, { workspace_nodes: [{ id: 'text-1' }], edges: [] });
    assert.deepEqual(saved.metadata.workflow_groups, [{ id: 'group-1' }]);
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
      ['agnes-image'],
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

    const textTask = services.workbench.generateStory({ drama_id: project.id, episode_id: episode.id, outline: '雨夜重逢' });
    await taskDone(() => services.tasks.get(textTask));
    assert.match(services.projects.require(project.id).episodes?.[0]?.script_content ?? '', /车站/u);

    const textImage = services.images.create({ dramaId: project.id, prompt: '雨夜车站', referenceImages: [] });
    const imageImage = services.images.create({ dramaId: project.id, prompt: '保持人物一致', referenceImages: ['https://cdn.test/ref.png'] });
    await Promise.all([
      taskDone(() => services.tasks.get(textImage.task_id as string)),
      taskDone(() => services.tasks.get(imageImage.task_id as string)),
    ]);
    assert.equal(services.images.get(textImage.id)?.image_url, 'https://cdn.test/text-to-image.png');
    assert.equal(services.images.get(imageImage.id)?.image_url, 'https://cdn.test/image-to-image.png');

    const textVideo = services.videos.create({ dramaId: project.id, prompt: '镜头推进', referenceImages: [] });
    const imageVideo = services.videos.create({ dramaId: project.id, prompt: '人物转身', firstFrame: 'https://cdn.test/start.png', referenceImages: [] });
    await Promise.all([
      taskDone(() => services.tasks.get(textVideo.task_id as string)),
      taskDone(() => services.tasks.get(imageVideo.task_id as string)),
    ]);
    assert.equal(services.videos.get(textVideo.id)?.video_url, 'https://cdn.test/text-to-video.mp4');
    assert.equal(services.videos.get(imageVideo.id)?.video_url, 'https://cdn.test/image-to-video.mp4');
  } finally { db.close(); }
});
