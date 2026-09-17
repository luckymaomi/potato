import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { ServiceContainer } from '../services/container';
import type { AppConfig } from '../types/core';
import { readNumber } from '../types/core';
import { created, success } from '../response';
import { idParam } from './http';
import { NotFoundError, ValidationError } from '../errors';

export function mediaRoutes(services: Pick<ServiceContainer, 'images' | 'videos'>, config: AppConfig): Router {
  const router = Router();
  const uploadDirectory = path.join(storageRoot(config), 'uploads');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, uploadDirectory),
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${extension(file)}`),
    }),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => callback(null, /^image\/(?:jpeg|png|gif|webp)$/u.test(file.mimetype)),
  });

  router.get('/images', (req, res) => {
    success(res, { items: services.images.list(optionalId(req.query.drama_id)) });
  });
  router.get('/images/:id', (req, res) => {
    const row = services.images.get(idParam(req));
    if (!row) throw new NotFoundError('图片生成记录不存在');
    success(res, row);
  });
  router.post('/images/:id/select', (req, res) => success(res, services.images.select(idParam(req))));

  router.get('/videos', (req, res) => {
    success(res, { items: services.videos.list(optionalId(req.query.drama_id)) });
  });
  router.get('/videos/:id', (req, res) => {
    const row = services.videos.get(idParam(req));
    if (!row) throw new NotFoundError('视频生成记录不存在');
    success(res, row);
  });
  router.post('/videos/:id/select', (req, res) => success(res, services.videos.select(idParam(req))));
  router.post('/videos/:id/resume-poll', (req, res) => {
    success(res, services.videos.resume(idParam(req)));
  });

  router.post('/upload/image', upload.single('file'), (req, res) => {
    if (!req.file) throw new ValidationError('请选择 JPEG、PNG、GIF 或 WebP 图片');
    const url = `/static/uploads/${req.file.filename}`;
    created(res, { url, path: url, local_path: req.file.path });
  });
  return router;
}

function storageRoot(config: AppConfig): string {
  return path.resolve(config.storage?.local_path ?? './data/storage');
}

function extension(file: Express.Multer.File): string {
  const byMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return byMime[file.mimetype] ?? path.extname(file.originalname).toLowerCase();
}

function optionalId(value: unknown): number | undefined {
  const id = readNumber(value);
  return id && id > 0 ? id : undefined;
}
