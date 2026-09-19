import type { ProviderRegistry } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { CompositionService } from './compositionService';
import { AssetRepository } from './assetRepository';
import { ImageGenerationService } from './imageGenerationService';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveService } from './mediaArchiveService';
import { ProjectArchiveService } from './projectArchiveService';
import { ProjectService } from './projectService';
import { ProductionWorkflowService } from './productionWorkflowService';
import { TaskService } from './taskService';
import { TextGenerationService } from './textGenerationService';
import { VideoGenerationService } from './videoGenerationService';

export interface ServiceContainer {
  aiConfigs: AiConfigService;
  composition: CompositionService;
  assets: AssetRepository;
  images: ImageGenerationService;
  projectArchives: ProjectArchiveService;
  projects: ProjectService;
  production: ProductionWorkflowService;
  tasks: TaskService;
  text: TextGenerationService;
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
  const text = new TextGenerationService(aiConfigs, registry, log);
  const mediaArchive = new MediaArchiveService(config, log);
  const projects = new ProjectService(db, mediaArchive, log);
  const assets = new AssetRepository(db, log);
  const mediaReferences = new MediaReferenceService(config, db);
  const images = new ImageGenerationService(db, mediaReferences, mediaArchive, aiConfigs, tasks, registry, log);
  const videos = new VideoGenerationService(db, mediaReferences, mediaArchive, aiConfigs, tasks, registry, log);
  const composition = new CompositionService(db, config, tasks, log);
  return {
    aiConfigs,
    composition,
    assets,
    images,
    projectArchives: new ProjectArchiveService(db, projects, assets, mediaArchive),
    projects,
    production: new ProductionWorkflowService(db, projects, assets, text, images, videos, composition, tasks, log),
    tasks,
    text,
    videos,
  };
}
