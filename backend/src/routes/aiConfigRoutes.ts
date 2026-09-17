import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import type { AiServiceType } from '../types/ai';
import { success } from '../response';
import { asyncRoute, bodyRecord } from './http';
import { ValidationError } from '../errors';
import { readString } from '../types/core';

export function aiConfigRoutes(services: ServiceContainer): Router {
  const router = Router();

  router.get('/ai-configs/providers', (_req, res) => {
    success(res, services.aiConfigs.providers());
  });

  router.get('/ai-configs/models', (req, res) => {
    success(res, services.aiConfigs.models(
      readString(req.query.provider),
      serviceType(req.query.service_type),
    ));
  });

  router.post('/ai-configs/models/refresh', asyncRoute(async (req, res) => {
    const body = bodyRecord(req);
    const provider = readString(body.provider);
    if (!provider) throw new ValidationError('provider 不能为空');
    success(res, await services.aiConfigs.refresh(provider, serviceType(body.service_type)));
  }));

  return router;
}

function serviceType(value: unknown): AiServiceType | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'text' || value === 'image' || value === 'video') return value;
  throw new ValidationError('service_type 必须是 text、image 或 video');
}
