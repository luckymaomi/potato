import { Router } from 'express';
import { ValidationError } from '../errors';
import { parseProductionCommand } from '../production/commands';
import { success } from '../response';
import type { ServiceContainer } from '../services/container';

export function productionRoutes(services: Pick<ServiceContainer, 'production'>): Router {
  const router = Router();
  router.post('/production/execute', (req, res) => {
    const command = parseProductionCommand(req.body);
    if (command.kind === 'ai-text') throw new ValidationError('文本 AI 功能已移除，请人工编辑故事、剧本和分镜');
    success(res, services.production.execute(command));
  });
  return router;
}
