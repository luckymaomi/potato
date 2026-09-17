import type { Logger, SQLiteDatabase } from '../src/types/core';
import type { Drama } from '../src/types/domain';
import type { ServiceContainer } from '../src/services/container';
import { createDemoWorkspace, DEMO_VERSION } from '../../frontend/src/features/production/demoWorkspace';
import { RAINY_NIGHT_DEMO } from '../../frontend/src/features/production/rainyNightDemoDefinition';

export function initializeRainyNightDemo(
  db: SQLiteDatabase,
  services: ServiceContainer,
  log?: Logger,
): Drama {
  log?.audit?.('demo.rainy-night.initialize.started', { demoVersion: DEMO_VERSION });
  const initialize = db.transaction(() => {
    const existing = services.projects.list({ page: 1, pageSize: 200 }).items;
    const demo = existing.find((item) => item.metadata.demo === true);
    if (!demo && existing.length) {
      throw new Error('数据库中已有项目；为避免覆盖，请在空数据库上运行 Demo 初始化脚本。');
    }
    const wasComplete = demo ? rainyNightDemoComplete(services.projects.require(demo.id)) : false;
    const definition = {
      ...RAINY_NIGHT_DEMO.project,
      metadata: {
        aspect_ratio: RAINY_NIGHT_DEMO.media.aspectRatio,
        demo: true,
        demo_version: DEMO_VERSION,
        demo_provider: RAINY_NIGHT_DEMO.media.provider,
        prewritten_text: true,
      },
    };
    const project = demo
      ? services.projects.update(demo.id, definition)
      : services.projects.create(definition);
    const episode = services.projects.saveEpisodes(project.id, [{
      episode_number: 1,
      title: '第 1 集｜雨夜外卖',
      duration: 40,
      script_content: RAINY_NIGHT_DEMO.script,
    }])[0];
    if (!episode) throw new Error('Demo 剧集初始化失败。');

    services.assets.syncCharacters(project.id, RAINY_NIGHT_DEMO.characters.map((item) => ({
      name: item.name,
      description: item.description,
      appearance: item.appearance,
    })));
    services.assets.syncScenes(project.id, RAINY_NIGHT_DEMO.scenes.map((item) => ({ ...item })));
    services.assets.syncProps(project.id, RAINY_NIGHT_DEMO.props.map((item) => ({ ...item })));
    services.assets.syncStoryboards(episode.id, RAINY_NIGHT_DEMO.storyboards.map((item) => ({
      ...item,
      characters: [...item.characters],
      scenes: [...item.scenes],
      props: [...item.props],
    })));

    const hydrated = services.projects.require(project.id);
    if (wasComplete) return hydrated;
    return services.projects.saveCanvas(
      project.id,
      createDemoWorkspace(hydrated),
      hydrated.canvas_revision,
    );
  });

  const project = initialize();
  log?.audit?.('demo.rainy-night.initialize.completed', {
    projectId: project.id,
    demoVersion: DEMO_VERSION,
    characters: project.characters?.length ?? 0,
    scenes: project.scenes?.length ?? 0,
    props: project.props?.length ?? 0,
    storyboards: project.episodes?.[0]?.storyboards?.length ?? 0,
  });
  return project;
}

export function rainyNightDemoComplete(project: Drama): boolean {
  const layout = project.metadata.canvas_layout;
  const workspaceNodes = layout && typeof layout === 'object' && !Array.isArray(layout)
    ? (layout as { workspace_nodes?: unknown[] }).workspace_nodes
    : undefined;
  return project.metadata.demo_version === DEMO_VERSION
    && project.characters?.length === RAINY_NIGHT_DEMO.characters.length
    && project.scenes?.length === RAINY_NIGHT_DEMO.scenes.length
    && project.props?.length === RAINY_NIGHT_DEMO.props.length
    && project.episodes?.[0]?.storyboards?.length === RAINY_NIGHT_DEMO.storyboards.length
    && workspaceNodes?.length === 46;
}
