import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import type { AppConfig } from '../types/core';
import { created, page, success } from '../response';
import { asyncRoute, bodyRecord, idParam } from './http';
import { NotFoundError, ValidationError } from '../errors';

export function projectRoutes(
  services: Pick<ServiceContainer, 'projects' | 'delivery'>,
  config: AppConfig,
): Router {
  const router = Router();
  const deliveryDirectory = path.join(storageRoot(config), 'delivery-transfers');
  fs.mkdirSync(deliveryDirectory, { recursive: true });

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

  router.patch('/dramas/:id/episodes/:episodeId', (req, res) => {
    success(res, services.projects.updateEpisode(idParam(req), episodeIdParam(req), req.body));
  });

  router.delete('/dramas/:id/episodes/:episodeId', (req, res) => {
    if (!services.projects.removeEpisode(idParam(req), episodeIdParam(req))) {
      throw new NotFoundError('剧集不存在');
    }
    success(res, { removed: true });
  });

  router.get('/dramas/:id/episodes/:episodeId/export-preview', asyncRoute(async (req, res) => {
    const episode = services.projects.require(idParam(req)).episodes?.find((item) => item.id === episodeIdParam(req));
    if (!episode) throw new NotFoundError('剧集不存在');
    const media = services.delivery.episodeVideo(idParam(req), episode.id);
    await new Promise<void>((resolve, reject) => {
      res.download(media.filePath, `${safeDownloadName(episode.title)}-成片.mp4`, (error) => error ? reject(error) : resolve());
    });
  }));

  router.post('/dramas/:id/episodes/:episodeId/export-shots', asyncRoute(async (req, res) => {
    const projectId = idParam(req);
    const episodeId = episodeIdParam(req);
    const body = bodyRecord(req);
    const shotIds = Array.isArray(body.storyboard_ids)
      ? body.storyboard_ids.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];
    const temporary = path.join(deliveryDirectory, `${randomUUID()}.zip`);
    try {
      const episode = services.projects.require(projectId).episodes?.find((item) => item.id === episodeId);
      if (!episode) throw new NotFoundError('剧集不存在');
      await services.delivery.exportShots(projectId, episodeId, shotIds, temporary);
      await new Promise<void>((resolve, reject) => {
        res.download(temporary, `${safeDownloadName(episode.title)}-镜头包.zip`, (error) => error ? reject(error) : resolve());
      });
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  }));

  return router;
}

function storageRoot(config: AppConfig): string {
  return path.resolve(config.storage?.local_path ?? './data/storage');
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function episodeIdParam(req: { params: { episodeId?: string } }): number {
  const parsed = Number(req.params.episodeId);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ValidationError('剧集 ID 无效');
  return parsed;
}

function safeDownloadName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 80) || '未命名剧集';
}
