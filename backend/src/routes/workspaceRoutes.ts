import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { NotFoundError, ValidationError } from '../errors';
import type { ServiceContainer } from '../services/container';
import type { AssetKind, EpisodeRow, StoryboardRow } from '../types/domain';
import type { AppConfig } from '../types/core';
import { asRecord, readNumber, readString } from '../types/core';
import { created, success } from '../response';
import { assembleStoryboardPrompts } from '../services/storyboardPromptAssembler';
import { asyncRoute, bodyRecord, idParam } from './http';

export function workspaceRoutes(
  services: Pick<ServiceContainer, 'projects' | 'assets' | 'images' | 'videos' | 'production' | 'composition' | 'tasks'>,
  config: AppConfig,
): Router {
  const router = Router();
  const uploadDirectory = path.join(path.resolve(config.storage?.local_path ?? './data/storage'), 'uploads');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, uploadDirectory),
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${imageExtension(file)}`),
    }),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => callback(null, /^image\/(?:jpeg|png|gif|webp)$/u.test(file.mimetype)),
  });

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
      referenceImages: stringArray(body.reference_images),
    }));
  });
  router.post('/dramas/:id/assets/:assetId/upload-image', upload.single('file'), asyncRoute(async (req, res) => {
    const projectId = idParam(req);
    const asset = requireProjectAsset(services, projectId, positive(req.params.assetId, '项目资产'));
    if (!req.file) throw new ValidationError('请选择 JPEG、PNG、GIF 或 WebP 图片');
    try {
      created(res, await services.images.importLocal({
        dramaId: projectId,
        projectAssetId: asset.id,
        sourcePath: req.file.path,
        prompt: typeof req.body?.prompt === 'string' ? req.body.prompt : '本地上传',
      }));
    } finally {
      await fs.promises.rm(req.file.path, { force: true });
    }
  }));
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
  router.post('/dramas/:id/storyboards/:storyboardId/generate-image', (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    const body = bodyRecord(req);
    created(res, createStoryboardImage(services, projectId, shot, body));
  });
  router.post('/dramas/:id/storyboards/:storyboardId/upload-image', upload.single('file'), asyncRoute(async (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    if (!req.file) throw new ValidationError('请选择 JPEG、PNG、GIF 或 WebP 图片');
    try {
      created(res, await services.images.importLocal({
        dramaId: projectId,
        storyboardId: shot.id,
        sourcePath: req.file.path,
        prompt: typeof req.body?.prompt === 'string' ? req.body.prompt : '本地上传',
      }));
    } finally {
      await fs.promises.rm(req.file.path, { force: true });
    }
  }));
  router.delete('/dramas/:id/storyboards/:storyboardId/current-image', (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    services.images.clearStoryboardImage(shot.id);
    success(res, { cleared: true, storyboard: services.assets.getStoryboard(shot.id) });
  });
  router.post('/dramas/:id/storyboards/:storyboardId/generate-video', (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    const body = bodyRecord(req);
    success(res, createStoryboardVideo(services, projectId, shot, body));
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

function createStoryboardImage(
  services: Pick<ServiceContainer, 'assets' | 'images'>,
  projectId: number,
  shot: StoryboardRow,
  body: Record<string, unknown>,
) {
  const assets = shot.project_asset_ids.flatMap((id) => {
    const asset = requireProjectAsset(services, projectId, id);
    return [asset];
  });
  const assembled = assembleStoryboardPrompts({
    shot,
    assets,
    imagePromptOverride: readString(body.prompt),
  });
  return services.images.create({
    dramaId: projectId,
    storyboardId: shot.id,
    prompt: assembled.imagePrompt,
    negativePrompt: assembled.imageNegativePrompt,
    provider: readString(body.provider),
    model: readString(body.model),
    aspectRatio: readString(body.aspect_ratio),
    referenceImages: assembled.imageReferences,
  });
}

function createStoryboardVideo(
  services: Pick<ServiceContainer, 'assets' | 'images' | 'videos'>,
  projectId: number,
  shot: StoryboardRow,
  body: Record<string, unknown>,
) {
  const generationId = shot.current_image_generation_id;
  const image = generationId ? services.images.get(generationId) : undefined;
  if (!image?.image_url || image.status !== 'completed') throw new ValidationError('请先完成并选择这一镜的分镜图');
  const assets = shot.project_asset_ids.map((id) => requireProjectAsset(services, projectId, id));
  const assembled = assembleStoryboardPrompts({
    shot,
    assets,
    videoPromptOverride: readString(body.prompt),
    storyboardImageUrl: image.image_url,
  });
  return services.videos.create({
    dramaId: projectId,
    storyboardId: shot.id,
    prompt: assembled.videoPrompt,
    provider: readString(body.provider),
    model: readString(body.model),
    duration: readNumber(body.duration),
    aspectRatio: readString(body.aspect_ratio),
    image: assembled.videoReferences[0],
    firstFrame: assembled.videoReferences[0],
    referenceImages: assembled.videoReferences,
  });
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

function imageExtension(file: Express.Multer.File): string {
  const byMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return byMime[file.mimetype] ?? (path.extname(file.originalname).toLowerCase() || '.png');
}
