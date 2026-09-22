import type { ProviderRegistry } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { AssetRepository } from './assetRepository';
import { ImageGenerationService } from './imageGenerationService';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveService } from './mediaArchiveService';
import { ProjectService } from './projectService';
import { TaskService } from './taskService';
import { CaptionService } from './captionService';
import { PageLayoutService } from './pageLayoutService';
import { FreedubService } from './freedubService';

export interface ServiceContainer {
  aiConfigs: AiConfigService;
  assets: AssetRepository;
  images: ImageGenerationService;
  projects: ProjectService;
  tasks: TaskService;
  captions: CaptionService;
  pages: PageLayoutService;
  freedub: FreedubService;
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
  const captions = new CaptionService(db);
  const pages = new PageLayoutService(db, config);
  const freedub = new FreedubService(db, config);
  return {
    aiConfigs,
    assets,
    images,
    projects,
    tasks,
    captions,
    pages,
    freedub,
  };
}
