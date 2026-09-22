import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import { created, page, success } from '../response';
import { bodyRecord, idParam } from './http';
import { NotFoundError, ValidationError } from '../errors';

export function projectRoutes(services: Pick<ServiceContainer, 'projects'>): Router {
  const router = Router();
  router.get('/dramas', (req, res) => { const current = positive(req.query.page, 1); const size = Math.min(200, positive(req.query.page_size, 20)); const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined; const result = services.projects.list({ page: current, pageSize: size, keyword }); page(res, result.items, result.total, current, size); });
  router.get('/dramas/:id', (req, res) => success(res, services.projects.require(idParam(req))));
  router.post('/dramas', (req, res) => created(res, services.projects.create(req.body)));
  router.put('/dramas/:id', (req, res) => success(res, services.projects.update(idParam(req), req.body)));
  router.delete('/dramas/:id', (req, res) => { if (!services.projects.remove(idParam(req))) throw new NotFoundError('项目不存在'); success(res, { removed: true }); });
  router.put('/dramas/:id/episodes', (req, res) => success(res, { episodes: services.projects.saveEpisodes(idParam(req), bodyRecord(req).episodes) }));
  router.patch('/dramas/:id/episodes/:episodeId', (req, res) => success(res, services.projects.updateEpisode(idParam(req), episodeId(req), req.body)));
  router.delete('/dramas/:id/episodes/:episodeId', (req, res) => { if (!services.projects.removeEpisode(idParam(req), episodeId(req))) throw new NotFoundError('话不存在'); success(res, { removed: true }); });
  return router;
}
function positive(value: unknown, fallback: number): number { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; }
function episodeId(req: { params: { episodeId?: string } }): number { const n = Number(req.params.episodeId); if (!Number.isInteger(n) || n < 1) throw new ValidationError('话 ID 无效'); return n; }
