import type { Logger, SQLiteDatabase } from '../src/types/core';
import type { Drama } from '../src/types/domain';
import type { ServiceContainer } from '../src/services/container';
import { RAINY_NIGHT_DEMO } from '../../frontend/src/features/production/rainyNightDemoDefinition';

export function initializeRainyNightDemo(
  db: SQLiteDatabase,
  services: ServiceContainer,
  log?: Logger,
): Drama {
  log?.audit?.('demo.rainy-night.initialize.started', { demoContract: RAINY_NIGHT_DEMO.contract });
  const initialize = db.transaction(() => {
    const existing = services.projects.list({ page: 1, pageSize: 200 }).items;
    const demo = existing.find((item) => item.metadata.demo === true);
    if (!demo && existing.length) {
      throw new Error('数据库中已有项目；为避免覆盖，请在空数据库上运行 Demo 初始化脚本。');
    }
    if (demo && rainyNightDemoComplete(services.projects.require(demo.id))) return services.projects.require(demo.id);
    const definition = {
      ...RAINY_NIGHT_DEMO.project,
      metadata: {
        aspect_ratio: RAINY_NIGHT_DEMO.media.aspectRatio,
        demo: true,
        demo_contract: RAINY_NIGHT_DEMO.contract,
        prewritten_text: true,
      },
    };
    const project = demo
      ? services.projects.update(demo.id, definition)
      : services.projects.create(definition);
    const episode = services.projects.saveEpisodes(project.id, [{
      episode_number: 1,
      title: '第 1 集｜雨夜外卖',
      duration: 150,
      script_content: RAINY_NIGHT_DEMO.script,
    }])[0];
    if (!episode) throw new Error('Demo 剧集初始化失败。');

    const projectAssets = [
      ...RAINY_NIGHT_DEMO.characters.map((item) => ({ kind: 'character' as const, name: item.name, description: item.description, visual_description: item.appearance, prompt: item.assetPrompt })),
      ...RAINY_NIGHT_DEMO.scenes.map((item) => ({ kind: 'scene' as const, name: item.location, description: item.prompt, visual_description: item.prompt, prompt: item.prompt })),
      ...RAINY_NIGHT_DEMO.props.map((item) => ({ kind: 'prop' as const, name: item.name, description: item.description, visual_description: item.description, prompt: item.prompt })),
    ].map((item) => {
      const library = services.assets.listLibrary(item.kind).find((candidate) => candidate.name === item.name)
        ?? services.assets.createLibraryItem(item);
      services.assets.updateLibraryItem(library.id, item);
      const bound = services.assets.listProjectAssets(project.id, item.kind).find((candidate) => candidate.name === item.name)
        ?? services.assets.createProjectAsset(project.id, { from_library_item_id: library.id });
      return services.assets.updateProjectAsset(bound.id, item);
    });
    const assetIds = new Map(projectAssets.map((item) => [`${item.kind}:${item.name}`, item.id]));
    services.assets.syncStoryboards(episode.id, RAINY_NIGHT_DEMO.storyboards.map((item) => ({
      ...item,
      shot_size: shotSize(item.description),
      camera_angle: '平视',
      camera_movement: '固定镜头，可按动作节奏轻微推进',
      composition: item.description,
      lighting: item.scenes.includes('雨夜街道') ? '雨夜路灯与湿地反光' : '冷色室内光',
      mood: '都市偶遇中的紧张与意外',
      sound: '环境声、动作声与现场对白',
      negative_prompt: '避免人物身份、服装和场景空间关系漂移，避免多余人物与文字水印',
      grid_rows: 3,
      grid_columns: 3,
      project_asset_ids: [
        ...item.characters.map((name) => assetIds.get(`character:${name}`)),
        ...item.scenes.map((name) => assetIds.get(`scene:${name}`)),
        ...item.props.map((name) => assetIds.get(`prop:${name}`)),
      ].filter((id): id is number => Boolean(id)),
    })));
    return services.projects.require(project.id);
  });

  const project = initialize();
  log?.audit?.('demo.rainy-night.initialize.completed', {
    projectId: project.id,
    demoContract: RAINY_NIGHT_DEMO.contract,
    projectAssets: project.project_assets?.length ?? 0,
    storyboards: project.episodes?.[0]?.storyboards?.length ?? 0,
  });
  return project;
}

export function rainyNightDemoComplete(project: Drama): boolean {
  return project.metadata.demo_contract === RAINY_NIGHT_DEMO.contract
    && project.project_assets?.length === RAINY_NIGHT_DEMO.characters.length + RAINY_NIGHT_DEMO.scenes.length + RAINY_NIGHT_DEMO.props.length
    && project.episodes?.[0]?.storyboards?.length === RAINY_NIGHT_DEMO.storyboards.length;
}

function shotSize(description: string): string {
  if (description.includes('特写')) return '特写';
  if (description.includes('近景')) return '近景';
  if (description.includes('中景')) return '中景';
  return '全景';
}
