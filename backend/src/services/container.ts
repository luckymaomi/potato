import type { ProviderRegistry } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { CompositionService } from './compositionService';
import { EntityService } from './entityService';
import { ImageGenerationService } from './imageGenerationService';
import { MediaReferenceService } from './mediaReferenceService';
import { ProjectArchiveService } from './projectArchiveService';
import { ProjectService } from './projectService';
import { ProductionWorkflowService } from './productionWorkflowService';
import { StoryboardService } from './storyboardService';
import { TaskService } from './taskService';
import { TextGenerationService } from './textGenerationService';
import { VideoGenerationService } from './videoGenerationService';

export interface ServiceContainer {
  aiConfigs: AiConfigService;
  composition: CompositionService;
  entities: EntityService;
  images: ImageGenerationService;
  projectArchives: ProjectArchiveService;
  projects: ProjectService;
  production: ProductionWorkflowService;
  storyboards: StoryboardService;
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
  const aiConfigs = new AiConfigService(db, registry, config);
  const tasks = new TaskService(db);
  const projects = new ProjectService(db);
  const entities = new EntityService(db);
  const storyboards = new StoryboardService(db);
  const text = new TextGenerationService(aiConfigs, registry, log);
  const mediaReferences = new MediaReferenceService(config);
  const images = new ImageGenerationService(db, mediaReferences, aiConfigs, tasks, registry, log);
  const videos = new VideoGenerationService(db, config, mediaReferences, aiConfigs, tasks, registry, log);
  const composition = new CompositionService(db, config, tasks);
  return {
    aiConfigs,
    composition,
    entities,
    images,
    projectArchives: new ProjectArchiveService(db, projects),
    projects,
    production: new ProductionWorkflowService(db, projects, entities, storyboards, text, images, videos, composition, tasks),
    storyboards,
    tasks,
    text,
    videos,
  };
}
