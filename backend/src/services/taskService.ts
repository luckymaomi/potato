import { randomUUID } from 'node:crypto';
import {
  parseStoredError,
  serializeError,
  serializeStructuredError,
  type StructuredError,
} from '../errorContract';
import type { SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TaskRecord {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  message: string | null;
  error: string | null;
  failure: StructuredError | null;
  result: Record<string, unknown> | null;
  resource_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TaskRow extends Omit<TaskRecord, 'result' | 'failure'> { result: string | null }

export interface TaskReporter {
  signal: AbortSignal;
  progress(value: number, message?: string): void;
  throwIfCancelled(): void;
}

export class TaskService {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly db: SQLiteDatabase) {}

  failInterrupted(): number {
    const now = new Date().toISOString();
    const failure = serializeStructuredError({
      code: 'TASK_INTERRUPTED',
      message: '服务重启中断了任务，请重新运行',
      status: 503,
      retryable: true,
    });
    return this.db.prepare(`
      UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ?, completed_at = ?
      WHERE status IN ('pending', 'processing')
    `).run(failure, now, now).changes;
  }

  run(
    type: string,
    resourceId: string | null,
    work: (reporter: TaskReporter) => Promise<Record<string, unknown>>,
  ): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO async_tasks (id, type, status, progress, resource_id, created_at, updated_at)
      VALUES (?, ?, 'pending', 0, ?, ?, ?)
    `).run(id, type, resourceId, now, now);
    this.controllers.set(id, new AbortController());
    queueMicrotask(() => {
      void this.execute(id, work);
    });
    return id;
  }

  get(id: string): TaskRecord | undefined {
    const row = this.db.prepare('SELECT * FROM async_tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!row) return undefined;
    const failure = parseStoredError(row.error);
    return {
      ...row,
      error: failure?.message ?? null,
      failure,
      result: parseJson<Record<string, unknown> | null>(row.result, null),
    };
  }

  cancel(id: string, reason = '用户取消'): TaskRecord | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE async_tasks SET status = 'cancelled', message = ?, updated_at = ?, completed_at = ?
      WHERE id = ? AND status IN ('pending', 'processing')
    `).run(reason, now, now, id);
    this.controllers.get(id)?.abort(new Error(reason));
    return this.get(id);
  }

  private async execute(
    id: string,
    work: (reporter: TaskReporter) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    const controller = this.controllers.get(id) ?? new AbortController();
    this.update(id, 'processing', 1, '任务已开始');
    const reporter: TaskReporter = {
      signal: controller.signal,
      progress: (value, message) => {
        if (!controller.signal.aborted) this.update(id, 'processing', clamp(value), message);
      },
      throwIfCancelled: () => {
        if (controller.signal.aborted) throw controller.signal.reason ?? new Error('任务已取消');
      },
    };
    try {
      reporter.throwIfCancelled();
      const result = await work(reporter);
      if (this.get(id)?.status === 'cancelled') return;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE async_tasks SET status = 'completed', progress = 100, message = ?, result = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
      `).run('任务完成', JSON.stringify(result), now, now, id);
    } catch (error) {
      if (this.get(id)?.status === 'cancelled' || controller.signal.aborted) return;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ?, completed_at = ? WHERE id = ?
      `).run(serializeError(error), now, now, id);
    } finally {
      this.controllers.delete(id);
    }
  }

  private update(id: string, status: TaskStatus, progress: number, message?: string): void {
    this.db.prepare(`
      UPDATE async_tasks SET status = ?, progress = ?, message = COALESCE(?, message), updated_at = ?
      WHERE id = ? AND status <> 'cancelled'
    `).run(status, progress, message ?? null, new Date().toISOString(), id);
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
