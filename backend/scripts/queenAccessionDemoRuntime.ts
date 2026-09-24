import type { Logger, SQLiteDatabase } from '../src/types/core';
import type { Drama } from '../src/types/domain';
import type { ServiceContainer } from '../src/services/container';
import { RAINY_NIGHT_DEMO } from '../../frontend/src/features/production/queenAccessionDemoDefinition';

export function initializeQueenAccessionDemo(
  db: SQLiteDatabase,
  services: ServiceContainer,
  log?: Logger,
): Drama {
  log?.audit?.('demo.mist-harbor.initialize.started', { demoContract: RAINY_NIGHT_DEMO.contract });
  const initialize = db.transaction(() => {
    const existing = services.projects.list({ page: 1, pageSize: 200 }).items;
    const demo = existing.find((item) => item.metadata.demo === true);
    if (!demo && existing.length) {
      throw new Error('数据库中已有项目；为避免覆盖，请在空数据库上运行 Demo 初始化脚本。');
    }
    if (demo && queenAccessionDemoComplete(services.projects.require(demo.id))) return services.projects.require(demo.id);
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
      title: '第 1 话｜女王出浴',
      duration: RAINY_NIGHT_DEMO.panels.length * RAINY_NIGHT_DEMO.media.duration,
      script_content: RAINY_NIGHT_DEMO.script,
      ...RAINY_NIGHT_DEMO.episodePlan,
    }])[0];
    if (!episode) throw new Error('Demo 话初始化失败。');

    const projectAssets = [
      ...RAINY_NIGHT_DEMO.characters.map((item) => ({
        kind: 'character' as const,
        name: item.name,
        text_profile: { ...item.text_profile },
        output_type: 'character-layout-a' as const,
        output_prompt: item.output_prompt,
      })),
      ...RAINY_NIGHT_DEMO.scenes.map((item) => ({
        kind: 'scene' as const,
        name: item.location,
        text_profile: { ...item.text_profile },
        output_type: 'scene-panorama' as const,
        output_prompt: item.output_prompt,
      })),
      ...RAINY_NIGHT_DEMO.props.map((item) => ({
        kind: 'prop' as const,
        name: item.name,
        text_profile: { ...item.text_profile },
        output_type: 'prop-multi-angle' as const,
        output_prompt: item.output_prompt,
      })),
    ].map((item) => {
      const bound = services.assets.listProjectAssets(project.id, item.kind).find((candidate) => candidate.name === item.name)
        ?? services.assets.createProjectAsset(project.id, item);
      return services.assets.updateProjectAsset(bound.id, item);
    });
    const assetIds = new Map(projectAssets.map((item) => [`${item.kind}:${item.name}`, item.id]));
    services.assets.syncPanels(episode.id, RAINY_NIGHT_DEMO.panels.map((item) => ({
      ...item,
      composition: item.composition ?? item.description,
      lighting: item.lighting ?? '冷色室内光',
      mood: item.mood ?? '悬疑与压迫',
      project_asset_ids: [
        ...item.characters.map((name) => assetIds.get(`character:${name}`)),
        ...item.scenes.map((name) => assetIds.get(`scene:${name}`)),
        ...item.props.map((name) => assetIds.get(`prop:${name}`)),
      ].filter((id): id is number => Boolean(id)),
    })));
    return services.projects.require(project.id);
  });

  const project = initialize();
  log?.audit?.('demo.mist-harbor.initialize.completed', {
    projectId: project.id,
    demoContract: RAINY_NIGHT_DEMO.contract,
    projectAssets: project.project_assets?.length ?? 0,
    panels: project.episodes?.[0]?.panels?.length ?? 0,
  });
  return project;
}
export function queenAccessionDemoComplete(project: Drama): boolean {
  return project.metadata.demo_contract === RAINY_NIGHT_DEMO.contract
    && project.project_assets?.length === RAINY_NIGHT_DEMO.characters.length + RAINY_NIGHT_DEMO.scenes.length + RAINY_NIGHT_DEMO.props.length
    && project.episodes?.[0]?.panels?.length === RAINY_NIGHT_DEMO.panels.length;
}
