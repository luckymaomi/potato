import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { loadConfig } from './config/index';
import { getDb } from './db/index';
import { initializeDatabase } from './db/schema';
import { resolveError } from './errorContract';
import logger from './logger';
import { providerRegistry } from './providers';
import { failure } from './response';
import { createApiRouter } from './routes/index';
import { createServices } from './services/container';
import type { AppContext } from './types/core';

export function createApp(): AppContext {
  const config = loadConfig();
  const db = getDb(config.database);
  initializeDatabase(db);
  const services = createServices(db, config, providerRegistry, logger);
  const interrupted = services.tasks.failInterrupted();
  if (interrupted) logger.warn('已将服务重启前未完成的任务标记为失败', { interrupted });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cors({ origin: config.server.cors_origins?.length ? config.server.cors_origins : '*' }));
  const requestLogger: RequestHandler = (req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  };
  app.use(requestLogger);

  const storageRoot = path.resolve(config.storage?.local_path ?? './data/storage');
  fs.mkdirSync(storageRoot, { recursive: true });
  app.use('/static', express.static(storageRoot));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', app: config.app.name, version: config.app.version });
  });
  app.use('/api/v1', createApiRouter(services, config));

  const webDist = process.env.WEB_DIST_PATH || path.join(process.cwd(), '..', 'frontend', 'dist');
  if (fs.existsSync(webDist)) {
    app.use('/assets', express.static(path.join(webDist, 'assets')));
    app.use(express.static(webDist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/static')) return next();
      const entry = path.join(webDist, 'index.html');
      return fs.existsSync(entry) ? res.sendFile(entry) : next();
    });
  }

  app.use((req, res) => {
    if (req.path.startsWith('/api')) return failure(res, 404, 'NOT_FOUND', 'API endpoint not found');
    return res.status(404).send('Not Found');
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('请求失败', { path: req.path, message: err.message });
    if (res.headersSent) return;
    const resolved = resolveError(error);
    failure(
      res,
      resolved.responseStatus,
      resolved.error.code,
      resolved.error.message,
      {
        status: resolved.error.status,
        retryable: resolved.error.retryable,
        provider: resolved.error.provider,
      },
    );
  };
  app.use(errorHandler);
  return { app, config, db };
}
