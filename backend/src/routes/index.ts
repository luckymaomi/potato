import { Router } from 'express';
import type { AppConfig } from '../types/core';
import type { ServiceContainer } from '../services/container';
import { aiConfigRoutes } from './aiConfigRoutes';
import { entityRoutes } from './entityRoutes';
import { mediaRoutes } from './mediaRoutes';
import { productionRoutes } from './productionRoutes';
import { projectRoutes } from './projectRoutes';
import { storyboardRoutes } from './storyboardRoutes';
import { taskRoutes } from './taskRoutes';
import { workspaceRoutes } from './workspaceRoutes';

export function createApiRouter(services: ServiceContainer, config: AppConfig): Router {
  const router = Router();
  router.use(projectRoutes(services, config));
  router.use(workspaceRoutes(services, config));
  router.use(aiConfigRoutes(services));
  router.use(mediaRoutes(services, config));
  router.use(entityRoutes(services));
  router.use(storyboardRoutes(services));
  router.use(productionRoutes(services));
  router.use(taskRoutes(services));
  return router;
}
