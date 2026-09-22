import { Router } from 'express';
import type { AppConfig } from '../types/core';
import type { ServiceContainer } from '../services/container';
import { aiConfigRoutes } from './aiConfigRoutes';
import { mediaRoutes } from './mediaRoutes';
import { projectRoutes } from './projectRoutes';
import { taskRoutes } from './taskRoutes';
import { workspaceRoutes } from './workspaceRoutes';

export function createApiRouter(services: ServiceContainer, config: AppConfig): Router {
  const router = Router();
  router.use(projectRoutes(services));
  router.use(workspaceRoutes(services, config));
  router.use(aiConfigRoutes(services));
  router.use(mediaRoutes(services, config));
  router.use(taskRoutes(services));
  return router;
}
