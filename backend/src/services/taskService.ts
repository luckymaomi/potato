import { randomUUID } from 'node:crypto';
import type { SQLiteDatabase } from '../types/core';
import { asError, parseJson } from '../types/core';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TaskRecord {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  message: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  resource_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TaskRow extends Omit<TaskRecord, 'result'> { result: string | null }

export interface TaskReporter {
  progress(value: number, message?: string): void;
}

export class TaskService {
  constructor(private readonly db: SQLiteDatabase) {}

  failInterrupted(): number {
    const now = new Date().toISOString();
    return this.db.prepare(`
      UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ?, completed_at = ?
      WHERE status IN ('pending', 'processing')
    `).run('服务重启中断了任务，请重新运行', now, now).changes;
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
    queueMicrotask(() => {
      void this.execute(id, work);
    });
    return id;
  }

  get(id: string): TaskRecord | undefined {
    const row = this.db.prepare('SELECT * FROM async_tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? { ...row, result: parseJson<Record<string, unknown> | null>(row.result, null) } : undefined;
  }

  cancel(id: string, reason = '用户取消'): TaskRecord | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE async_tasks SET status = 'cancelled', message = ?, updated_at = ?, completed_at = ?
      WHERE id = ? AND status IN ('pending', 'processing')
    `).run(reason, now, now, id);
    return this.get(id);
  }

  private async execute(
    id: string,
    work: (reporter: TaskReporter) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    this.update(id, 'processing', 1, '任务已开始');
    const reporter: TaskReporter = {
      progress: (value, message) => this.update(id, 'processing', clamp(value), message),
    };
    try {
      const result = await work(reporter);
      if (this.get(id)?.status === 'cancelled') return;
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE async_tasks SET status = 'completed', progress = 100, message = ?, result = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
      `).run('任务完成', JSON.stringify(result), now, now, id);
    } catch (error) {
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ?, completed_at = ? WHERE id = ?
      `).run(asError(error).message, now, now, id);
    }
  }

  private update(id: string, status: TaskStatus, progress: number, message?: string): void {
    this.db.prepare(`
      UPDATE async_tasks SET status = ?, progress = ?, message = COALESCE(?, message), updated_at = ? WHERE id = ?
    `).run(status, progress, message ?? null, new Date().toISOString(), id);
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
