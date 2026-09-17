import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import { created, success } from '../response';
import { bodyRecord, idParam } from './http';
import { NotFoundError } from '../errors';

export function generationRoutes(services: ServiceContainer): Router {
  const router = Router();

  router.post('/generation/story', (req, res) => {
    success(res, { task_id: services.workbench.generateStory(req.body), status: 'pending' });
  });
  router.post('/generation/characters', (req, res) => {
    const episodeId = Number(bodyRecord(req).episode_id);
    success(res, { task_id: services.workbench.extractCharacters(episodeId, req.body), status: 'pending' });
  });
  router.post('/episodes/:id/characters/extract', (req, res) => {
    success(res, { task_id: services.workbench.extractCharacters(idParam(req), req.body) });
  });
  router.post('/images/episode/:id/backgrounds/extract', (req, res) => {
    success(res, { task_id: services.workbench.extractScenes(idParam(req), req.body) });
  });
  router.post('/episodes/:id/props/extract', (req, res) => {
    success(res, { task_id: services.workbench.extractProps(idParam(req), req.body) });
  });

  router.post('/storyboards', (req, res) => {
    created(res, services.storyboards.create(req.body));
  });
  router.get('/storyboards/:id', (req, res) => {
    const storyboard = services.storyboards.get(idParam(req));
    if (!storyboard) throw new NotFoundError('分镜不存在');
    success(res, storyboard);
  });
  router.put('/storyboards/:id', (req, res) => {
    success(res, services.storyboards.update(idParam(req), req.body));
  });
  router.get('/episodes/:id/storyboards', (req, res) => {
    success(res, { storyboards: services.storyboards.list(idParam(req)) });
  });
  router.post('/episodes/:id/storyboards', (req, res) => {
    success(res, { task_id: services.workbench.generateStoryboards(idParam(req), req.body), status: 'pending' });
  });
  router.post('/episodes/:id/finalize', (req, res) => {
    success(res, { task_id: services.composition.finalize(idParam(req)), status: 'pending' });
  });
  return router;
}
