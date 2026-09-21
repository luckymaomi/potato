import type { ProviderRegistry } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { CompositionService } from './compositionService';
import { AssetRepository } from './assetRepository';
import { ImageGenerationService } from './imageGenerationService';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveService } from './mediaArchiveService';
import { EpisodeDeliveryService } from './episodeDeliveryService';
import { ProjectService } from './projectService';
import { TaskService } from './taskService';
import { VideoGenerationService } from './videoGenerationService';

export interface ServiceContainer {
  aiConfigs: AiConfigService;
  composition: CompositionService;
  assets: AssetRepository;
  images: ImageGenerationService;
  delivery: EpisodeDeliveryService;
  projects: ProjectService;
  tasks: TaskService;
  videos: VideoGenerationService;
}

export function createServices(
  db: SQLiteDatabase,
  config: AppConfig,
  registry: ProviderRegistry,
  log: Logger,
): ServiceContainer {
  const aiConfigs = new AiConfigService(db, registry, config, log);
  const tasks = new TaskService(db, log);
  const mediaArchive = new MediaArchiveService(config, log);
  const projects = new ProjectService(db, mediaArchive, log);
  const assets = new AssetRepository(db, log);
  const mediaReferences = new MediaReferenceService(config, db);
  const images = new ImageGenerationService(db, mediaReferences, mediaArchive, aiConfigs, tasks, registry, log, assets);
  const videos = new VideoGenerationService(db, mediaReferences, mediaArchive, aiConfigs, tasks, registry, log, assets);
  const composition = new CompositionService(db, config, tasks, log);
  const delivery = new EpisodeDeliveryService(db, config);
  return {
    aiConfigs,
    composition,
    assets,
    images,
    delivery,
    projects,
    tasks,
    videos,
  };
}
