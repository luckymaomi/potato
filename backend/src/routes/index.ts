import { Router } from 'express';
import type { AppConfig } from '../types/core';
import type { ServiceContainer } from '../services/container';
import { aiConfigRoutes } from './aiConfigRoutes';
import { entityRoutes } from './entityRoutes';
import { generationRoutes } from './generationRoutes';
import { mediaRoutes } from './mediaRoutes';
import { projectRoutes } from './projectRoutes';
import { taskRoutes } from './taskRoutes';

export function createApiRouter(services: ServiceContainer, config: AppConfig): Router {
  const router = Router();
  router.use(projectRoutes(services));
  router.use(aiConfigRoutes(services));
  router.use(mediaRoutes(services, config));
  router.use(entityRoutes(services));
  router.use(generationRoutes(services));
  router.use(taskRoutes(services));
  return router;
}
