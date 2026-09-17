import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import { success } from '../response';
import { idParam } from './http';
import { NotFoundError } from '../errors';

export function entityRoutes(services: Pick<ServiceContainer, 'entities'>): Router {
  const router = Router();

  router.get('/characters/:id', (req, res) => {
    const character = services.entities.getCharacter(idParam(req));
    if (!character) throw new NotFoundError('角色不存在');
    success(res, { character });
  });
  router.put('/characters/:id', (req, res) => {
    success(res, { character: services.entities.updateCharacter(idParam(req), req.body) });
  });

  router.get('/scenes/:id', (req, res) => {
    const scene = services.entities.getScene(idParam(req));
    if (!scene) throw new NotFoundError('场景不存在');
    success(res, { scene });
  });
  router.put('/scenes/:id', (req, res) => {
    success(res, { scene: services.entities.updateScene(idParam(req), req.body) });
  });

  router.get('/props/:id', (req, res) => {
    const prop = services.entities.getProp(idParam(req));
    if (!prop) throw new NotFoundError('道具不存在');
    success(res, { prop });
  });
  router.put('/props/:id', (req, res) => {
    success(res, { prop: services.entities.updateProp(idParam(req), req.body) });
  });
  return router;
}
