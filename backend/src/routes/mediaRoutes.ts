import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { ServiceContainer } from '../services/container';
import type { AppConfig } from '../types/core';
import { created, success } from '../response';
import { idParam } from './http';
import { NotFoundError, ValidationError } from '../errors';

export function mediaRoutes(services: Pick<ServiceContainer, 'images'>, config: AppConfig): Router {
  const router = Router();
  const uploadDirectory = path.join(path.resolve(config.storage?.local_path ?? './data/storage'), 'uploads');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const upload = multer({ storage: multer.diskStorage({ destination: (_req, _file, callback) => callback(null, uploadDirectory), filename: (_req, file, callback) => callback(null, `${randomUUID()}${extension(file)}`) }), limits: { fileSize: 16 * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(null, /^image\/(?:jpeg|png|gif|webp)$/u.test(file.mimetype)) });
  router.get('/images', (req, res) => success(res, { items: services.images.list(optionalId(req.query.drama_id)) }));
  router.get('/images/:id', (req, res) => { const row = services.images.get(idParam(req)); if (!row) throw new NotFoundError('图片生成记录不存在'); success(res, row); });
  router.post('/images/:id/select', (req, res) => success(res, services.images.select(idParam(req))));
  router.delete('/images/:id', async (req, res, next) => {
    try {
      success(res, await services.images.remove(idParam(req)));
    } catch (error) {
      next(error);
    }
  });
  router.post('/upload/image', upload.single('file'), (req, res) => { if (!req.file) throw new ValidationError('请选择图片'); const url = `/static/uploads/${req.file.filename}`; created(res, { url, path: url, local_path: req.file.path }); });
  return router;
}
function extension(file: Express.Multer.File): string { return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' } as Record<string, string>)[file.mimetype] ?? path.extname(file.originalname).toLowerCase(); }
function optionalId(value: unknown): number | undefined { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : undefined; }
