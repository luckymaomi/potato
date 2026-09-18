import { randomUUID } from 'node:crypto';
import {
  parseStoredError,
  serializeError,
  serializeStructuredError,
  type StructuredError,
} from '../errorContract';
import type { Logger, SQLiteDatabase } from '../types/core';
import { parseJson } from '../types/core';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TaskRecord {
  id: string;
  type: string;
  status: TaskStatus;
  progress?: number;
  message: string | null;
  error: string | null;
  failure: StructuredError | null;
  result: Record<string, unknown> | null;
  resource_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TaskRow extends Omit<TaskRecord, 'result' | 'failure' | 'progress'> {
  progress: number;
  result: string | null;
}

export interface TaskReporter {
  signal: AbortSignal;
  stage(message: string): void;
  progress(value: number, message?: string): void;
  throwIfCancelled(): void;
}

export class TaskService {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly db: SQLiteDatabase, private readonly log?: Logger) {}

  failInterrupted(): number {
    const now = new Date().toISOString();
    const failure = serializeStructuredError({
      code: 'TASK_INTERRUPTED',
      message: '服务重启中断了任务，请重新运行',
      status: 503,
      retryable: true,
    });
    const changed = this.db.prepare(`
      UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ?, completed_at = ?
      WHERE status IN ('pending', 'processing')
    `).run(failure, now, now).changes;
    if (changed) this.log?.audit?.('task.interrupted', { count: changed });
    return changed;
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
      VALUES (?, ?, 'pending', -1, ?, ?, ?)
    `).run(id, type, resourceId, now, now);
    this.log?.audit?.('task.created', { taskId: id, type, resourceId });
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
    const { progress, ...stored } = row;
    return {
      ...stored,
      ...(progress >= 0 ? { progress } : {}),
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
    this.log?.audit?.('task.cancelled', { taskId: id, reason });
    return this.get(id);
  }

  private async execute(
    id: string,
    work: (reporter: TaskReporter) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    const controller = this.controllers.get(id) ?? new AbortController();
    this.updateStage(id, '任务已开始');
    this.log?.audit?.('task.started', { taskId: id });
    const reporter: TaskReporter = {
      signal: controller.signal,
      stage: (message) => {
        if (!controller.signal.aborted) {
          this.updateStage(id, message);
          this.log?.audit?.('task.stage', { taskId: id, message });
        }
      },
      progress: (value, message) => {
        if (!controller.signal.aborted) {
          const progress = clamp(value);
          this.updateProgress(id, progress, message);
          this.log?.audit?.('task.progress', { taskId: id, progress, message });
        }
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
      this.log?.audit?.('task.completed', { taskId: id, result });
    } catch (error) {
      if (this.get(id)?.status === 'cancelled' || controller.signal.aborted) return;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ?, completed_at = ? WHERE id = ?
      `).run(serializeError(error), now, now, id);
      this.log?.audit?.('task.failed', { taskId: id, error });
    } finally {
      this.controllers.delete(id);
    }
  }

  private updateStage(id: string, message: string): void {
    this.db.prepare(`
      UPDATE async_tasks SET status = 'processing', progress = -1, message = ?, updated_at = ?
      WHERE id = ? AND status <> 'cancelled'
    `).run(message, new Date().toISOString(), id);
  }

  private updateProgress(id: string, progress: number, message?: string): void {
    this.db.prepare(`
      UPDATE async_tasks SET status = 'processing', progress = ?, message = COALESCE(?, message), updated_at = ?
      WHERE id = ? AND status <> 'cancelled'
    `).run(progress, message ?? null, new Date().toISOString(), id);
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) throw new Error('任务进度必须是有限数字');
  return Math.max(0, Math.min(100, Math.round(value)));
}
