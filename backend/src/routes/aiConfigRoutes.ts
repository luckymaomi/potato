import { Router } from 'express';
import type { ServiceContainer } from '../services/container';
import type { AiModelPreset, AiServiceType } from '../types/ai';
import { success } from '../response';
import { asyncRoute, bodyRecord } from './http';
import { ValidationError } from '../errors';
import { readString } from '../types/core';

export function aiConfigRoutes(services: Pick<ServiceContainer, 'aiConfigs'>): Router {
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

  router.get('/ai-configs/model-presets', (_req, res) => {
    success(res, services.aiConfigs.presets());
  });

  router.put('/ai-configs/model-presets', (req, res) => {
    const body = bodyRecord(req);
    success(res, services.aiConfigs.savePresets({
      text: modelPreset(body.text, 'text'),
      image: modelPreset(body.image, 'image'),
      video: modelPreset(body.video, 'video'),
    }));
  });

  return router;
}

function modelPreset(value: unknown, type: AiServiceType): AiModelPreset | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${type} 预设必须包含 provider 和 model`);
  const record = value as Record<string, unknown>;
  const provider = readString(record.provider);
  const model = readString(record.model);
  if (!provider || !model) throw new ValidationError(`${type} 预设必须包含 provider 和 model`);
  return { provider, model };
}

function serviceType(value: unknown): AiServiceType | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'text' || value === 'image' || value === 'video') return value;
  throw new ValidationError('service_type 必须是 text、image 或 video');
}
