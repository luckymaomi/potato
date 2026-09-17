import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import { success } from '../response';
import { bodyRecord } from './http';
import { NotFoundError } from '../errors';

export function taskRoutes(services: ServiceContainer): Router {
  const router = Router();
  router.get('/tasks/:id', (req, res) => {
    const task = services.tasks.get(req.params.id);
    if (!task) throw new NotFoundError('任务不存在');
    success(res, task);
  });
  router.post('/tasks/:id/cancel', (req, res) => {
    const reason = String(bodyRecord(req).reason ?? '用户取消');
    const task = services.tasks.cancel(req.params.id, reason);
    if (!task) throw new NotFoundError('任务不存在');
    success(res, task);
  });
  return router;
}
