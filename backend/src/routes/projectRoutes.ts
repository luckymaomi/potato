import { Router } from 'express';
import multer from 'multer';
import type { ServiceContainer } from '../services/container';
import { created, page, success } from '../response';
import { asyncRoute, bodyRecord, idParam } from './http';
import { NotFoundError, ValidationError } from '../errors';

export function projectRoutes(services: ServiceContainer): Router {
  const router = Router();
  const archiveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  router.get('/dramas', (req, res) => {
    const current = positiveInt(req.query.page, 1);
    const pageSize = Math.min(200, positiveInt(req.query.page_size, 20));
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined;
    const result = services.projects.list({ page: current, pageSize, keyword });
    page(res, result.items, result.total, current, pageSize);
  });

  router.get('/dramas/:id', (req, res) => {
    success(res, services.projects.require(idParam(req)));
  });

  router.post('/dramas', (req, res) => {
    created(res, services.projects.create(req.body));
  });

  router.put('/dramas/:id', (req, res) => {
    success(res, services.projects.update(idParam(req), req.body));
  });

  router.delete('/dramas/:id', (req, res) => {
    if (!services.projects.remove(idParam(req))) throw new NotFoundError('项目不存在');
    success(res, { removed: true });
  });

  router.put('/dramas/:id/episodes', (req, res) => {
    const body = bodyRecord(req);
    success(res, { episodes: services.projects.saveEpisodes(idParam(req), body.episodes) });
  });

  router.put('/dramas/:id/canvas-layout', (req, res) => {
    const body = bodyRecord(req);
    success(res, services.projects.saveCanvas(idParam(req), body.canvas_layout, body.workflow_groups));
  });

  router.get('/dramas/:id/export', (req, res) => {
    const buffer = services.projectArchives.export(idParam(req));
    res.type('application/zip').attachment('mini-video-project.zip').send(buffer);
  });

  router.post('/dramas/import', archiveUpload.single('file'), asyncRoute(async (req, res) => {
    if (!req.file) throw new ValidationError('请选择项目归档');
    created(res, services.projectArchives.import(req.file.buffer));
  }));

  return router;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
