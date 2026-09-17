import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { asRecord, readNumber } from '../types/core';
import { ValidationError } from '../errors';

export type AsyncRoute = (req: Request, res: Response) => Promise<void>;

export function asyncRoute(handler: AsyncRoute): RequestHandler {
  return (req, res, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

export function idParam(req: Request, name = 'id'): number {
  const id = readNumber(req.params[name]);
  if (!id || id < 1 || !Number.isInteger(id)) throw new ValidationError(`${name} 必须是有效 ID`);
  return id;
}

export function bodyRecord(req: Request): Record<string, unknown> {
  return asRecord(req.body) ?? {};
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}
