import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { NotFoundError, ValidationError } from '../errors';
import { created, success } from '../response';
import type { ServiceContainer } from '../services/container';
import { assembleAssetOutputPrompt } from '../services/assetOutputPromptAssembler';
import { normalizeOutputType, normalizeStringArray, normalizeTextProfile } from '../services/assetRepository';
import { assembleScriptScenes } from '../services/scriptAssembler';
import { assembleStoryboardRecipes } from '../services/storyboardPromptAssembler';
import { assertEpisodeReadyForComposition, assertStoryboardImageReady, assertStoryboardVideoReady } from '../services/storyboardReadiness';
import type { AppConfig } from '../types/core';
import { readNumber, readString } from '../types/core';
import type { AssetKind, EpisodeRow, StoryboardRow } from '../types/domain';
import { asyncRoute, bodyRecord, idParam } from './http';

export function workspaceRoutes(
  services: Pick<ServiceContainer, 'projects' | 'assets' | 'images' | 'videos' | 'composition'>,
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
    success(res, { overview: storyOverview(project), episode, episodes: project.episodes ?? [] });
  });

  router.put('/dramas/:id/script', (req, res) => {
    const projectId = idParam(req);
    const project = services.projects.require(projectId);
    const body = bodyRecord(req);
    const episode = selectEpisode(project.episodes ?? [], body.episode_id);
    const overview = body.overview && typeof body.overview === 'object' ? body.overview as Record<string, unknown> : {};
    services.projects.update(projectId, {
      story_hook: readString(overview.story_hook) ?? '',
      worldview: readString(overview.worldview) ?? '',
      storyline: readString(overview.storyline) ?? '',
      tone: readString(overview.tone) ?? '',
      reference_setting: readString(overview.reference_setting) ?? '',
    });
    const episodes = services.projects.saveEpisodes(projectId, [{
      ...episode,
      script_content: readString(body.script_content) ?? '',
      ...(body.episode_plan && typeof body.episode_plan === 'object' ? body.episode_plan : {}),
    }]);
    success(res, {
      overview: storyOverview(services.projects.require(projectId)),
      episode: episodes.find((item) => item.id === episode.id) ?? episode,
      episodes,
    });
  });

  router.post('/dramas/:id/script/assemble', (req, res) => {
    const project = services.projects.require(idParam(req));
    const body = bodyRecord(req);
    selectEpisode(project.episodes ?? [], body.episode_id);
    success(res, { script_content: assembleScriptScenes(body.scenes) });
  });

  router.get('/dramas/:id/assets', (req, res) => {
    success(res, { items: services.assets.listProjectAssets(idParam(req), optionalKind(req.query.kind)) });
  });
  router.post('/dramas/:id/assets', (req, res) => created(res, services.assets.createProjectAsset(idParam(req), req.body)));
  router.post('/dramas/:id/assets/assemble-output-prompt', (req, res) => {
    services.projects.require(idParam(req));
    const body = bodyRecord(req);
    const kind = requiredAssetKind(body.kind);
    const outputType = normalizeOutputType(kind, body.output_type);
    const source = {
      kind,
      name: readString(body.name) ?? `未命名${assetLabel(kind)}卡`,
      text_profile: normalizeTextProfile(kind, body.text_profile),
      output_type: outputType,
    };
    success(res, { output_type: outputType, output_prompt: assembleAssetOutputPrompt(source) });
  });
  router.patch('/dramas/:id/assets/:assetId', (req, res) => {
    const asset = requireProjectAsset(services, idParam(req), positive(req.params.assetId, '项目资产'));
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
    if (!asset.output_prompt.trim()) throw new ValidationError('请先组装或填写最终生成提示词并保存');
    created(res, services.images.create({
      dramaId: projectId,
      projectAssetId: asset.id,
      prompt: asset.output_prompt,
      provider: readString(body.provider),
      model: readString(body.model),
      aspectRatio: readString(body.aspect_ratio),
      referenceImages: asset.input_reference_images,
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
        prompt: '人工上传标准资产图',
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
  router.get('/dramas/:id/storyboards/:storyboardId/readiness', (req, res) => {
    const projectId = idParam(req);
    const storyboard = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    success(res, storyboardReadiness(services, projectId, storyboard));
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
    const storyboard = requireStoryboard(services, idParam(req), positive(req.params.storyboardId, '分镜'));
    success(res, services.assets.updateStoryboard(storyboard.id, req.body));
  });
  router.post('/dramas/:id/storyboards/:storyboardId/confirm-review', (req, res) => {
    const storyboard = requireStoryboard(services, idParam(req), positive(req.params.storyboardId, '分镜'));
    const media = bodyRecord(req).media;
    if (media !== 'image' && media !== 'video') throw new ValidationError('确认类型必须是 image 或 video');
    success(res, services.assets.confirmStoryboardReview(storyboard.id, media));
  });
  router.post('/dramas/:id/storyboards/:storyboardId/assemble-recipes', (req, res) => {
    const projectId = idParam(req);
    const storyboard = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    const draft = storyboardRecipeDraft(storyboard, bodyRecord(req));
    const assets = draft.project_asset_ids.map((assetId) => requireProjectAsset(services, projectId, assetId));
    success(res, assembleStoryboardRecipes({ shot: draft, assets }));
  });
  router.delete('/dramas/:id/storyboards/:storyboardId', (req, res) => {
    const storyboard = requireStoryboard(services, idParam(req), positive(req.params.storyboardId, '分镜'));
    success(res, { removed: services.assets.deleteStoryboard(storyboard.id) });
  });
  router.post('/dramas/:id/storyboards/:storyboardId/generate-image', (req, res) => {
    const projectId = idParam(req);
    const shot = requireStoryboard(services, projectId, positive(req.params.storyboardId, '分镜'));
    const body = bodyRecord(req);
    const assets = shot.project_asset_ids.map((assetId) => requireProjectAsset(services, projectId, assetId));
    assertStoryboardImageReady(shot, assets);
    created(res, services.images.create({
      dramaId: projectId,
      storyboardId: shot.id,
      prompt: shot.image_recipe_prompt,
      provider: readString(body.provider),
      model: readString(body.model),
      aspectRatio: readString(body.aspect_ratio),
      referenceImages: shot.image_recipe_references,
    }));
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
        prompt: '人工上传分镜图',
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
    const generationId = shot.current_image_generation_id;
    const image = generationId ? services.images.get(generationId) : undefined;
    if (!image?.image_url || image.status !== 'completed') throw new ValidationError('请先完成并选择这一镜的分镜图');
    const readiness = assertStoryboardVideoReady(shot);
    success(res, { ...services.videos.create({
      dramaId: projectId,
      storyboardId: shot.id,
      prompt: shot.video_recipe_prompt,
      provider: readString(body.provider),
      model: readString(body.model),
      duration: readNumber(body.duration),
      aspectRatio: readString(body.aspect_ratio),
      firstFrame: image.image_url,
      referenceImages: shot.video_recipe_references,
    }), ...(readiness.warning ? { readiness_warning: readiness.warning } : {}) });
  });

  router.post('/dramas/:id/episodes/:episodeId/compose', (req, res) => {
    const projectId = idParam(req);
    const episodeId = positive(req.params.episodeId, '集数');
    const episode = selectEpisode(services.projects.require(projectId).episodes ?? [], episodeId);
    const shots = services.assets.listStoryboards(episode.id);
    if (!shots.length) throw new ValidationError('整集合成前至少需要一个分镜');
    const missing = shots.filter((shot) => !shot.video_url).map((shot) => shot.storyboard_number);
    if (missing.length) throw new ValidationError(`整集合成缺少镜头视频：${missing.join('、')}`);
    assertEpisodeReadyForComposition(shots);
    success(res, { status: 'pending', task_id: services.composition.finalize(episode.id, shots.map((shot) => shot.video_url as string)) });
  });

  return router;
}

function storyboardReadiness(
  services: Pick<ServiceContainer, 'assets' | 'images'>,
  projectId: number,
  shot: StoryboardRow,
): { image: { ready: boolean; reason?: string }; video: { ready: boolean; reason?: string; warning?: string } } {
  const image = readinessResult(() => assertStoryboardImageReady(
    shot,
    shot.project_asset_ids.map((assetId) => requireProjectAsset(services, projectId, assetId)),
  ));
  const video = readinessResult(() => {
    const generation = shot.current_image_generation_id ? services.images.get(shot.current_image_generation_id) : undefined;
    if (!generation?.image_url || generation.status !== 'completed') throw new ValidationError('请先完成并选择这一镜的分镜图');
    return assertStoryboardVideoReady(shot);
  });
  return { image, video };
}

function readinessResult(value: () => { warning?: string } | void): { ready: boolean; reason?: string; warning?: string } {
  try {
    const result = value();
    return { ready: true, ...(result?.warning ? { warning: result.warning } : {}) };
  } catch (error) {
    if (error instanceof ValidationError) return { ready: false, reason: error.message };
    throw error;
  }
}

function storyOverview(project: { story_hook: string; worldview: string; storyline: string; tone: string; reference_setting: string }) {
  return {
    story_hook: project.story_hook ?? '',
    worldview: project.worldview ?? '',
    storyline: project.storyline ?? '',
    tone: project.tone ?? '',
    reference_setting: project.reference_setting ?? '',
  };
}

function selectEpisode(episodes: EpisodeRow[], rawId: unknown): EpisodeRow {
  const requested = readNumber(rawId);
  const episode = requested ? episodes.find((item) => item.id === requested) : episodes[0];
  if (!episode) throw new NotFoundError('项目集数不存在');
  return episode;
}

function requireProjectAsset(services: Pick<ServiceContainer, 'assets'>, projectId: number, assetId: number) {
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
  if (value === undefined) return undefined;
  if (value === 'character' || value === 'scene' || value === 'prop') return value;
  throw new ValidationError('资产类型必须是 character、scene 或 prop');
}

function requiredAssetKind(value: unknown): AssetKind {
  const kind = optionalKind(value);
  if (!kind) throw new ValidationError('资产类型必须是 character、scene 或 prop');
  return kind;
}

function assetLabel(kind: AssetKind): string {
  return { character: '角色', scene: '场景', prop: '道具' }[kind];
}

function storyboardRecipeDraft(current: StoryboardRow, body: Record<string, unknown>): StoryboardRow {
  const text = (key: keyof StoryboardRow): string | null => {
    if (body[key] === undefined) return current[key] as string | null;
    return readString(body[key]) ?? null;
  };
  const assetIds = body.project_asset_ids === undefined
    ? current.project_asset_ids
    : uniquePositiveNumbers(body.project_asset_ids);
  const extraReferences = body.extra_reference_images === undefined
    ? current.extra_reference_images
    : normalizeStringArray(body.extra_reference_images);
  return {
    ...current,
    title: text('title'),
    description: text('description'),
    action: text('action'),
    dialogue: text('dialogue'),
    image_prompt: text('image_prompt'),
    video_prompt: text('video_prompt'),
    shot_size: text('shot_size'),
    camera_angle: text('camera_angle'),
    camera_movement: text('camera_movement'),
    composition: text('composition'),
    lighting: text('lighting'),
    mood: text('mood'),
    sound: text('sound'),
    project_asset_ids: assetIds,
    extra_reference_images: extraReferences,
  };
}

function uniquePositiveNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(readNumber).filter((item): item is number => Boolean(item && Number.isInteger(item) && item > 0)))];
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
