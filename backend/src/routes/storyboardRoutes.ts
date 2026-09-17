import { Router } from 'express';
import { NotFoundError } from '../errors';
import { created, success } from '../response';
import type { ServiceContainer } from '../services/container';
import { idParam } from './http';

export function storyboardRoutes(services: Pick<ServiceContainer, 'assets'>): Router {
  const router = Router();
  router.post('/storyboards', (req, res) => created(res, services.assets.createStoryboard(req.body)));
  router.get('/storyboards/:id', (req, res) => {
    const storyboard = services.assets.getStoryboard(idParam(req));
    if (!storyboard) throw new NotFoundError('分镜不存在');
    success(res, storyboard);
  });
  router.put('/storyboards/:id', (req, res) => success(res, services.assets.updateStoryboard(idParam(req), req.body)));
  router.get('/episodes/:id/storyboards', (req, res) => success(res, { storyboards: services.assets.listStoryboards(idParam(req)) }));
  return router;
}
