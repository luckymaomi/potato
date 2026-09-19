import { Router } from 'express';
import { NotFoundError, ValidationError } from '../errors';
import type { ServiceContainer } from '../services/container';
import type { AssetKind, EpisodeRow, StoryboardRow } from '../types/domain';
import { asRecord, readNumber, readString } from '../types/core';
import { created, success } from '../response';
import { bodyRecord, idParam } from './http';
import type { TaskReporter } from '../services/taskService';

export function workspaceRoutes(
  services: Pick<ServiceContainer, 'projects' | 'assets' | 'images' | 'videos' | 'production' | 'composition' | 'tasks'>,
): Router {
  const router = Router();

  router.get('/dramas/:id/script', (req, res) => {
    const project = services.projects.require(idParam(req));
    const episode = selectEpisode(project.episodes ?? [], req.query.episode_id);
    success(res, { overview: project.description ?? '', episode, episodes: project.episodes ?? [] });
  });

  router.put('/dramas/:id/script', (req, res) => {
    const projectId = idParam(req);
    const project = services.projects.require(projectId);
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    services.projects.update(projectId, { description: readString(body.overview) ?? '' });
    const episodes = services.projects.saveEpisodes(projectId, [{
      ...episode,
      script_content: readString(body.script_content) ?? '',
    }]);
    success(res, {
      overview: services.projects.require(projectId).description ?? '',
      episode: episodes.find((item) => item.id === episode.id) ?? episode,
      episodes,
    });
  });

  router.get('/asset-library', (req, res) => {
    success(res, { items: services.assets.listLibrary(optionalKind(req.query.kind)) });
  });
  router.post('/asset-library', (req, res) => created(res, services.assets.createLibraryItem(req.body)));
  router.get('/asset-library/:id', (req, res) => {
    const item = services.assets.getLibraryItem(idParam(req));
    if (!item) throw new NotFoundError('全局资产不存在');
    success(res, item);
  });
  router.patch('/asset-library/:id', (req, res) => success(res, services.assets.updateLibraryItem(idParam(req), req.body)));
  router.post('/asset-library/:id/generate-image', (req, res) => {
    const item = services.assets.getLibraryItem(idParam(req));
    if (!item) throw new NotFoundError('全局资产不存在');
    const body = bodyRecord(req);
    created(res, services.images.create({
      dramaId: null,
      libraryItemId: item.id,
      prompt: readString(body.prompt) ?? assetPrompt(item),
      provider: readString(body.provider),
      model: readString(body.model),
      aspectRatio: readString(body.aspect_ratio),
      referenceImages: stringArray(body.reference_images),
    }));
  });

  router.get('/dramas/:id/assets', (req, res) => {
    success(res, { items: services.assets.listProjectAssets(idParam(req), optionalKind(req.query.kind)) });
  });
  router.post('/dramas/:id/assets', (req, res) => created(res, services.assets.createProjectAsset(idParam(req), req.body)));
  router.patch('/dramas/:id/assets/:assetId', (req, res) => {
    const projectId = idParam(req);
    const asset = requireProjectAsset(services, projectId, positive(req.params.assetId, '项目资产'));
    success(res, services.assets.updateProjectAsset(asset.id, req.body));
  });
  router.delete('/dramas/:id/assets/:assetId', (req, res) => {
    const asset = requireProjectAsset(services, idParam(req), positive(req.params.assetId, '项目资产'));
    success(res, { removed: services.assets.deleteProjectAsset(asset.id) });
  });
  router.post('/dramas/:id/assets/:assetId/lock-current', (req, res) => {
    const asset = requireProjectAsset(services, idParam(req), positive(req.params.assetId, '项目资产'));
    success(res, services.assets.lockProjectAsset(asset.id));
  });
  router.post('/dramas/:id/assets/:assetId/upgrade-lock', (req, res) => {
    const asset = requireProjectAsset(services, idParam(req), positive(req.params.assetId, '项目资产'));
    success(res, services.assets.upgradeProjectAsset(asset.id));
  });
  router.post('/dramas/:id/assets/:assetId/generate-image', (req, res) => {
    const projectId = idParam(req);
    const asset = requireProjectAsset(services, projectId, positive(req.params.assetId, '项目资产'));
    const body = bodyRecord(req);
    created(res, services.images.create({
      dramaId: projectId,
      projectAssetId: asset.id,
      prompt: readString(body.prompt) ?? assetPrompt(asset),
      provider: readString(body.provider),
      model: readString(body.model),
      aspectRatio: readString(body.aspect_ratio),
      referenceImages: [...new Set([
        ...lockedAssetImages(services, projectId, asset.dependency_asset_ids),
        ...stringArray(body.reference_images),
      ])],
    }));
  });
  router.post('/dramas/:id/assets/extract', (req, res) => {
    const projectId = idParam(req);
    const body = bodyRecord(req);
    const kind = requiredKind(body.kind);
    const episode = selectEpisode(services.projects.require(projectId).episodes ?? [], body.episode_id);
    success(res, services.production.execute({
      kind: 'ai-text',
      projectId,
      episodeId: episode.id,
      action: kind === 'character' ? 'extract-characters' : kind === 'scene' ? 'extract-scenes' : 'extract-props',
      sourceText: readString(body.source_text) ?? episode.script_content ?? '',
      systemPrompt: readString(body.system_prompt),
      provider: readString(body.provider),
      model: readString(body.model),
    }));
  });
  router.post('/dramas/:id/assets/generate-batch', (req, res) => {
    const projectId = idParam(req);
    const body = bodyRecord(req);
    const kind = optionalKind(body.kind);
    const requested = new Set(Array.isArray(body.asset_ids) ? body.asset_ids.map(readNumber).filter((id): id is number => Boolean(id)) : []);
    const assetIds = services.assets.listProjectAssets(projectId, kind)
      .filter((asset) => (!requested.size || requested.has(asset.id)) && !asset.locked_image_generation_id)
      .map((asset) => asset.id);
    const taskId = services.tasks.run('asset_image_batch', String(projectId), (reporter) => runAssetImageBatch(
      services, projectId, assetIds, body, reporter,
    ));
    success(res, { status: 'pending', task_id: taskId, queued: assetIds.length });
  });

  router.get('/dramas/:id/storyboards', (req, res) => {
    const project = services.projects.require(idParam(req));
    const episode = selectEpisode(project.episodes ?? [], req.query.episode_id);
    success(res, { episode, items: services.assets.listStoryboards(episode.id) });
  });
  router.post('/dramas/:id/storyboards', (req, res) => {
    const project = services.projects.require(idParam(req));
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    created(res, services.assets.createStoryboard({ ...body, episode_id: episode.id }));
  });
  router.put('/dramas/:id/storyboards', (req, res) => {
    const project = services.projects.require(idParam(req));
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    success(res, { items: services.assets.syncStoryboards(episode.id, Array.isArray(body.items) ? body.items : []) });
  });
  router.patch('/dramas/:id/storyboards/:storyboardId', (req, res) => {
    const projectId = idParam(req);
    const storyboard = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    success(res, services.assets.updateStoryboard(storyboard.id, req.body));
  });
  router.delete('/dramas/:id/storyboards/:storyboardId', (req, res) => {
    const projectId = idParam(req);
    const storyboard = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    success(res, { removed: services.assets.deleteStoryboard(storyboard.id) });
  });
  router.post('/dramas/:id/storyboards/split', (req, res) => {
    const projectId = idParam(req);
    const project = services.projects.require(projectId);
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    success(res, services.production.execute({
      kind: 'ai-text',
      projectId,
      episodeId: episode.id,
      action: 'split-storyboards',
      sourceText: readString(body.source_text) ?? episode.script_content ?? '',
      systemPrompt: readString(body.system_prompt),
      storyboardCount: readNumber(body.storyboard_count),
      provider: readString(body.provider),
      model: readString(body.model),
    }));
  });
  router.post('/dramas/:id/storyboards/:storyboardId/generate-image', (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    const body = bodyRecord(req);
    created(res, createStoryboardImage(services, projectId, shot, body));
  });
  router.post('/dramas/:id/storyboards/:storyboardId/generate-video', (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    const body = bodyRecord(req);
    success(res, createStoryboardVideo(services, projectId, shot, body));
  });
  router.post('/dramas/:id/produce/batch', (req, res) => {
    const projectId = idParam(req);
    const project = services.projects.require(projectId);
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    const target = readString(body.target);
    if (target !== 'images' && target !== 'videos') throw new ValidationError('批量目标必须是 images 或 videos');
    if (target === 'videos' && body.confirm_cost !== true) throw new ValidationError('批量生成视频前必须明确确认费用');
    if (target === 'images') {
      const taskId = services.tasks.run('storyboard_image_batch', String(episode.id), (reporter) => runStoryboardImageBatch(
        services, projectId, episode.id, body, reporter,
      ));
      success(res, { status: 'pending', task_id: taskId });
      return;
    }
    const submissions: Array<Record<string, unknown>> = [];
    for (const shot of services.assets.listStoryboards(episode.id)) {
      try {
        if (shot.current_image_generation_id && !shot.current_video_generation_id) {
          submissions.push({ target_id: shot.id, submission_status: 'submitted', ...createStoryboardVideo(services, projectId, shot, body) });
        }
      } catch (error) {
        submissions.push({
          target_id: shot.id,
          submission_status: 'rejected',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    success(res, { target, submitted: submissions.filter((item) => item.submission_status === 'submitted').length, items: submissions });
  });
  router.post('/dramas/:id/episodes/:episodeId/compose', (req, res) => {
    const projectId = idParam(req);
    const episodeId = positive(req.params.episodeId, '集数');
    const episode = selectEpisode(services.projects.require(projectId).episodes ?? [], episodeId);
    const shots = services.assets.listStoryboards(episode.id);
    if (!shots.length) throw new ValidationError('整集合成前至少需要一个分镜');
    const missing = shots.filter((shot) => !shot.video_url).map((shot) => shot.storyboard_number);
    if (missing.length) throw new ValidationError(`整集合成缺少镜头视频：${missing.join('、')}`);
    const videos = shots.map((shot) => shot.video_url as string);
    success(res, { status: 'pending', task_id: services.composition.finalize(episode.id, videos) });
  });

  return router;
}

async function runAssetImageBatch(
  services: Pick<ServiceContainer, 'assets' | 'images' | 'tasks'>,
  projectId: number,
  requestedIds: number[],
  body: Record<string, unknown>,
  reporter: TaskReporter,
  reportProgress = true,
): Promise<Record<string, unknown>> {
  const pending = new Set(dependencyClosure(services, projectId, requestedIds).filter((id) => !assetImageReady(services, id)));
  const total = pending.size;
  const failed = new Set<number>();
  const outcomes: Array<Record<string, unknown>> = [];
  while (pending.size) {
    reporter.throwIfCancelled();
    const ready: number[] = [];
    for (const id of [...pending]) {
      const asset = requireProjectAsset(services, projectId, id);
      const failedDependency = asset.dependency_asset_ids.find((dependencyId) => failed.has(dependencyId));
      if (failedDependency) {
        failed.add(id);
        pending.delete(id);
        outcomes.push({ target_id: id, status: 'blocked', error: '依赖资产生成失败' });
        continue;
      }
      if (asset.dependency_asset_ids.every((dependencyId) => assetImageReady(services, dependencyId))) ready.push(id);
    }
    if (!ready.length) {
      for (const id of pending) outcomes.push({ target_id: id, status: 'blocked', error: '图片依赖尚未完成' });
      break;
    }
    reporter.stage(`正在并发生成 ${ready.length} 个依赖已满足的资产图`);
    const running = ready.flatMap((id) => {
      pending.delete(id);
      const asset = requireProjectAsset(services, projectId, id);
      try {
        const generation = services.images.create({
          dramaId: projectId,
          projectAssetId: asset.id,
          prompt: asset.prompt ?? '',
          provider: readString(body.provider),
          model: readString(body.model),
          aspectRatio: readString(body.aspect_ratio),
          referenceImages: lockedAssetImages(services, projectId, asset.dependency_asset_ids),
        });
        return generation.task_id ? [{ targetId: id, taskId: generation.task_id }] : [];
      } catch (error) {
        failed.add(id);
        outcomes.push({ target_id: id, status: 'rejected', error: error instanceof Error ? error.message : String(error) });
        return [];
      }
    });
    const completed = await Promise.all(running.map(async ({ targetId, taskId }) => ({ targetId, task: await waitForLocalTask(services, taskId, reporter) })));
    for (const { targetId, task } of completed) {
      if (task.status === 'completed') outcomes.push({ target_id: targetId, status: 'completed', task_id: task.id });
      else {
        failed.add(targetId);
        outcomes.push({ target_id: targetId, status: task.status, task_id: task.id, error: task.error });
      }
    }
    if (reportProgress && total) reporter.progress(Math.round(((total - pending.size) / total) * 100), `已处理 ${total - pending.size}/${total} 个资产图`);
  }
  return { total, completed: outcomes.filter((item) => item.status === 'completed').length, items: outcomes };
}

async function runStoryboardImageBatch(
  services: Pick<ServiceContainer, 'assets' | 'images' | 'tasks'>,
  projectId: number,
  episodeId: number,
  body: Record<string, unknown>,
  reporter: TaskReporter,
): Promise<Record<string, unknown>> {
  const shots = services.assets.listStoryboards(episodeId).filter((shot) => !shot.current_image_generation_id);
  const dependencies = [...new Set(shots.flatMap((shot) => shot.project_asset_ids))];
  const assetResults = await runAssetImageBatch(services, projectId, dependencies, body, reporter, false);
  reporter.throwIfCancelled();
  reporter.stage(`正在并发生成 ${shots.length} 张分镜图`);
  const outcomes: Array<Record<string, unknown>> = [];
  const running = shots.flatMap((shot) => {
    try {
      const generation = createStoryboardImage(services, projectId, shot, body);
      return generation.task_id ? [{ targetId: shot.id, taskId: generation.task_id }] : [];
    } catch (error) {
      outcomes.push({ target_id: shot.id, status: 'blocked', error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });
  let finished = 0;
  await Promise.all(running.map(async ({ targetId, taskId }) => {
    const task = await waitForLocalTask(services, taskId, reporter);
    finished += 1;
    if (shots.length) reporter.progress(Math.round((finished / shots.length) * 100), `已处理 ${finished}/${shots.length} 张分镜图`);
    outcomes.push({ target_id: targetId, status: task.status, task_id: task.id, error: task.error });
  }));
  return {
    total: shots.length,
    completed: outcomes.filter((item) => item.status === 'completed').length,
    asset_dependencies: assetResults,
    items: outcomes,
  };
}

function dependencyClosure(
  services: Pick<ServiceContainer, 'assets'>,
  projectId: number,
  requestedIds: number[],
): number[] {
  const collected = new Set<number>();
  const pending = [...requestedIds];
  while (pending.length) {
    const id = pending.pop();
    if (!id || collected.has(id)) continue;
    const asset = requireProjectAsset(services, projectId, id);
    collected.add(id);
    pending.push(...asset.dependency_asset_ids);
  }
  return [...collected];
}

function assetImageReady(services: Pick<ServiceContainer, 'assets' | 'images'>, assetId: number): boolean {
  const asset = services.assets.getProjectAsset(assetId);
  const generation = asset?.locked_image_generation_id ? services.images.get(asset.locked_image_generation_id) : undefined;
  return Boolean(generation?.status === 'completed' && generation.image_url);
}

async function waitForLocalTask(
  services: Pick<ServiceContainer, 'tasks'>,
  taskId: string,
  reporter: TaskReporter,
) {
  for (;;) {
    reporter.throwIfCancelled();
    const task = services.tasks.get(taskId);
    if (!task) throw new Error('本地生成任务不存在');
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return task;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function createStoryboardImage(
  services: Pick<ServiceContainer, 'assets' | 'images'>,
  projectId: number,
  shot: StoryboardRow,
  body: Record<string, unknown>,
) {
  const references = lockedAssetImages(services, projectId, shot.project_asset_ids);
  const prompt = readString(body.prompt) ?? imagePrompt(shot);
  return services.images.create({
    dramaId: projectId,
    storyboardId: shot.id,
    prompt,
    provider: readString(body.provider),
    model: readString(body.model),
    aspectRatio: readString(body.aspect_ratio),
    referenceImages: references,
  });
}

function createStoryboardVideo(
  services: Pick<ServiceContainer, 'images' | 'videos'>,
  projectId: number,
  shot: StoryboardRow,
  body: Record<string, unknown>,
) {
  const generationId = shot.current_image_generation_id;
  const image = generationId ? services.images.get(generationId) : undefined;
  if (!image?.image_url || image.status !== 'completed') throw new ValidationError('请先完成并选择这一镜的分镜图');
  return services.videos.create({
    dramaId: projectId,
    storyboardId: shot.id,
    prompt: readString(body.prompt) ?? shot.video_prompt ?? shot.description ?? '',
    provider: readString(body.provider),
    model: readString(body.model),
    duration: readNumber(body.duration) ?? shot.duration ?? undefined,
    aspectRatio: readString(body.aspect_ratio),
    image: image.image_url,
    firstFrame: image.image_url,
    referenceImages: [image.image_url],
  });
}

function lockedAssetImages(
  services: Pick<ServiceContainer, 'assets' | 'images'>,
  projectId: number,
  ids: number[],
): string[] {
  return ids.map((id) => {
    const asset = requireProjectAsset(services, projectId, id);
    const generation = asset.locked_image_generation_id ? services.images.get(asset.locked_image_generation_id) : undefined;
    if (!generation?.image_url || generation.status !== 'completed') {
      throw new ValidationError(`依赖资产“${asset.name}”还没有完成并锁定的标准图`);
    }
    return generation.image_url;
  });
}

function imagePrompt(shot: StoryboardRow): string {
  const base = shot.image_prompt ?? shot.description ?? shot.title ?? '';
  if (shot.grid_rows === 1 && shot.grid_columns === 1) return base;
  return `${base}\n构图要求：同一镜头使用 ${shot.grid_rows}×${shot.grid_columns} 网格故事板呈现连续关键画面；这是单张分镜图，不拆分为多个镜头。`;
}

function assetPrompt(item: { name: string; description: string | null; appearance: string | null; prompt: string | null }): string {
  return item.prompt ?? item.appearance ?? item.description ?? item.name;
}

function selectEpisode(episodes: EpisodeRow[], rawId: unknown): EpisodeRow {
  const requested = readNumber(rawId);
  const episode = requested ? episodes.find((item) => item.id === requested) : episodes[0];
  if (!episode) throw new NotFoundError('项目集数不存在');
  return episode;
}

function requireProjectAsset(
  services: Pick<ServiceContainer, 'assets'>,
  projectId: number,
  assetId: number,
) {
  const asset = services.assets.getProjectAsset(assetId);
  if (!asset || asset.drama_id !== projectId) throw new NotFoundError('项目资产不存在');
  return asset;
}

function requireStoryboard(
  services: Pick<ServiceContainer, 'assets'>,
  projectId: number,
  storyboardId: number,
): StoryboardRow {
  const shot = services.assets.getStoryboard(storyboardId);
  const episode = shot ? services.assets.episode(shot.episode_id) : undefined;
  if (!shot || !episode || episode.drama_id !== projectId) throw new NotFoundError('分镜不存在');
  return shot;
}

function optionalKind(value: unknown): AssetKind | undefined {
  return value === undefined ? undefined : requiredKind(value);
}

function requiredKind(value: unknown): AssetKind {
  if (value === 'character' || value === 'scene' || value === 'prop') return value;
  throw new ValidationError('资产类型必须是 character、scene 或 prop');
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
}

function positive(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number(value) : readNumber(value);
  if (!parsed || !Number.isInteger(parsed) || parsed < 1) throw new ValidationError(`${label} ID 无效`);
  return parsed;
}
