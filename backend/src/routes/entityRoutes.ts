import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import { success } from '../response';
import { bodyRecord, idParam } from './http';
import { NotFoundError } from '../errors';

export function entityRoutes(services: ServiceContainer): Router {
  const router = Router();

  router.get('/characters/:id', (req, res) => {
    const character = services.entities.getCharacter(idParam(req));
    if (!character) throw new NotFoundError('角色不存在');
    success(res, { character });
  });
  router.put('/characters/:id', (req, res) => {
    success(res, { character: services.entities.updateCharacter(idParam(req), req.body) });
  });
  router.post('/characters/:id/generate-image', (req, res) => {
    const character = services.entities.getCharacter(idParam(req));
    if (!character) throw new NotFoundError('角色不存在');
    const body = bodyRecord(req);
    const image = services.images.create({
      dramaId: character.drama_id,
      characterId: character.id,
      prompt: [character.description, character.appearance].filter(Boolean).join('\n') || character.name,
      model: text(body.model),
      provider: text(body.provider),
      referenceImages: [],
    });
    success(res, { image_generation: image });
  });

  router.get('/scenes/:id', (req, res) => {
    const scene = services.entities.getScene(idParam(req));
    if (!scene) throw new NotFoundError('场景不存在');
    success(res, { scene });
  });
  router.put('/scenes/:id', (req, res) => {
    success(res, { scene: services.entities.updateScene(idParam(req), req.body) });
  });
  router.post('/scenes/generate-image', (req, res) => {
    const body = bodyRecord(req);
    const sceneId = Number(body.scene_id);
    const scene = services.entities.getScene(sceneId);
    if (!scene) throw new NotFoundError('场景不存在');
    const image = services.images.create({
      dramaId: scene.drama_id,
      sceneId: scene.id,
      prompt: scene.prompt || scene.location,
      model: text(body.model),
      provider: text(body.provider),
      referenceImages: [],
    });
    success(res, { image_generation: image });
  });

  router.get('/props/:id', (req, res) => {
    const prop = services.entities.getProp(idParam(req));
    if (!prop) throw new NotFoundError('道具不存在');
    success(res, { prop });
  });
  router.put('/props/:id', (req, res) => {
    success(res, { prop: services.entities.updateProp(idParam(req), req.body) });
  });
  router.post('/props/:id/generate', (req, res) => {
    const prop = services.entities.getProp(idParam(req));
    if (!prop) throw new NotFoundError('道具不存在');
    const body = bodyRecord(req);
    const image = services.images.create({
      dramaId: prop.drama_id,
      propId: prop.id,
      prompt: prop.prompt || prop.description || prop.name,
      model: text(body.model),
      provider: text(body.provider),
      referenceImages: [],
    });
    success(res, { task_id: image.task_id, image_generation: image });
  });

  return router;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
