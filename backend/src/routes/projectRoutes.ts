import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { ServiceContainer } from '../services/container';
import type { AppConfig } from '../types/core';
import { created, page, success } from '../response';
import { asyncRoute, bodyRecord, idParam } from './http';
import { NotFoundError, ValidationError } from '../errors';

export function projectRoutes(
  services: Pick<ServiceContainer, 'projects' | 'projectArchives'>,
  config: AppConfig,
): Router {
  const router = Router();
  const archiveDirectory = path.join(storageRoot(config), 'archive-transfers');
  fs.mkdirSync(archiveDirectory, { recursive: true });
  const archiveUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, archiveDirectory),
      filename: (_req, _file, callback) => callback(null, `${randomUUID()}.zip`),
    }),
  });

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

  router.get('/dramas/:id/export', asyncRoute(async (req, res) => {
    const temporary = path.join(archiveDirectory, `${randomUUID()}.zip`);
    try {
      await services.projectArchives.export(idParam(req), temporary);
      await new Promise<void>((resolve, reject) => {
        res.download(temporary, 'tomato-ai-drama-project.zip', (error) => error ? reject(error) : resolve());
      });
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  }));

  router.post('/dramas/import', archiveUpload.single('file'), asyncRoute(async (req, res) => {
    if (!req.file) throw new ValidationError('请选择项目归档');
    try {
      created(res, await services.projectArchives.import(req.file.path));
    } finally {
      await fs.promises.rm(req.file.path, { force: true });
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
