import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from './types/core';

export function requestAudit(log: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    let responseBody: unknown;
    let recorded = false;
    const originalJson = res.json.bind(res);
    res.setHeader('X-Request-Id', requestId);
    res.json = ((body: unknown) => {
      responseBody = body;
      return originalJson(body);
    }) as typeof res.json;
    log.audit?.('http.request.started', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      query: req.query,
      body: req.body,
    });
    const finish = (connectionClosed = false) => {
      if (recorded) return;
      recorded = true;
      log.audit?.('http.request.completed', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        connectionClosed,
        query: req.query,
        params: req.params,
        body: req.body,
        upload: req.file ? {
          originalName: req.file.originalname,
          mediaType: req.file.mimetype,
          size: req.file.size,
        } : undefined,
        response: responseBody,
      });
    };
    res.once('finish', () => finish(false));
    res.once('close', () => finish(true));
    next();
  };
}
