import type { ProviderRegistry } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { CompositionService } from './compositionService';
import { EntityService } from './entityService';
import { ImageGenerationService } from './imageGenerationService';
import { ProjectArchiveService } from './projectArchiveService';
import { ProjectService } from './projectService';
import { StoryboardService } from './storyboardService';
import { TaskService } from './taskService';
import { TextGenerationService } from './textGenerationService';
import { VideoGenerationService } from './videoGenerationService';
import { WorkbenchGenerationService } from './workbenchGenerationService';

export interface ServiceContainer {
  aiConfigs: AiConfigService;
  composition: CompositionService;
  entities: EntityService;
  images: ImageGenerationService;
  projectArchives: ProjectArchiveService;
  projects: ProjectService;
  storyboards: StoryboardService;
  tasks: TaskService;
  text: TextGenerationService;
  videos: VideoGenerationService;
  workbench: WorkbenchGenerationService;
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
  const images = new ImageGenerationService(db, config, aiConfigs, tasks, registry, log);
  const videos = new VideoGenerationService(db, config, aiConfigs, tasks, registry, log);
  return {
    aiConfigs,
    composition: new CompositionService(db, config, tasks),
    entities,
    images,
    projectArchives: new ProjectArchiveService(db, projects),
    projects,
    storyboards,
    tasks,
    text,
    videos,
    workbench: new WorkbenchGenerationService(db, projects, entities, storyboards, text, tasks),
  };
}
