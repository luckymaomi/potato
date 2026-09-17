import type { Response } from 'express';

function send(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).json({ ...body, timestamp: new Date().toISOString() });
}

export function success<T>(res: Response, data: T): void {
  send(res, 200, { success: true, data });
}

export function created<T>(res: Response, data: T): void {
  send(res, 201, { success: true, data });
}

export function page<T>(res: Response, items: T[], total: number, current: number, pageSize: number): void {
  send(res, 200, {
    success: true,
    data: {
      items,
      pagination: {
        page: current,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    },
  });
}

export function failure(res: Response, status: number, code: string, message: string, details?: unknown): void {
  send(res, status, {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  });
}
