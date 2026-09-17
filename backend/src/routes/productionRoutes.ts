import { Router } from 'express';
import { parseProductionCommand } from '../production/commands';
import { success } from '../response';
import type { ServiceContainer } from '../services/container';

export function productionRoutes(services: Pick<ServiceContainer, 'production'>): Router {
  const router = Router();
  router.get('/production/text-prompts', (_req, res) => {
    success(res, { items: services.production.textPrompts() });
  });
  router.post('/production/execute', (req, res) => {
    success(res, services.production.execute(parseProductionCommand(req.body)));
  });
  return router;
}
