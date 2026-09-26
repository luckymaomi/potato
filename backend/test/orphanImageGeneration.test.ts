import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { providerRegistry } from '../src/providers';
import { createServices } from '../src/services/container';
import type { AppConfig, Logger } from '../src/types/core';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-orphan-gen-'));
  const db = new Database(path.join(root, 'demo.db'));
  initializeDatabase(db);
  const config: AppConfig = {
    app: { name: 'orphan-test', version: '1' },
    server: {},
    database: { path: path.join(root, 'demo.db') },
    storage: { local_path: path.join(root, 'storage') },
  };
  const logger: Logger = { info() {}, warn() {}, error() {}, audit() {} };
  const services = createServices(db, config, providerRegistry, logger);
  return { root, db, services };
}

test('服务重启后 failInterrupted 会一并清掉卡住的 image_generations', () => {
  const { root, db, services } = setup();
  try {
    const project = services.projects.create({ title: '孤儿生成' });
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO async_tasks (id, type, status, progress, resource_id, created_at, updated_at)
      VALUES (?, 'image_generation', 'processing', -1, ?, ?, ?)
    `).run('task-orphan-1', '1', now, now);
    const insert = db.prepare(`
      INSERT INTO image_generations (
        drama_id, panel_id, provider, prompt, reference_images, status, task_id, created_at, updated_at
      ) VALUES (?, NULL, 'pearapi', 'test', '[]', 'processing', ?, ?, ?)
    `).run(project.id, 'task-orphan-1', now, now);
    const generationId = Number(insert.lastInsertRowid);

    const interrupted = services.tasks.failInterrupted();
    assert.equal(interrupted, 1);
    const reclaimed = services.images.reclaimStaleActiveGenerations();
    assert.ok(reclaimed >= 1);

    const row = db.prepare('SELECT status, error_msg, failure_stage FROM image_generations WHERE id = ?').get(generationId) as {
      status: string;
      error_msg: string | null;
      failure_stage: string | null;
    };
    assert.equal(row.status, 'failed');
    assert.match(String(row.error_msg), /服务重启中断了任务|生成任务已失败|已中断/);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('list 会回收任务已失败但仍卡在 processing 的生成记录', () => {
  const { root, db, services } = setup();
  try {
    const project = services.projects.create({ title: '列表回收' });
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO async_tasks (id, type, status, progress, resource_id, error, created_at, updated_at, completed_at)
      VALUES (?, 'image_generation', 'failed', -1, ?, ?, ?, ?, ?)
    `).run('task-dead-1', '1', JSON.stringify({ message: '服务重启中断了任务，请重新运行' }), now, now, now);
    db.prepare(`
      INSERT INTO image_generations (
        drama_id, panel_id, provider, prompt, reference_images, status, task_id, created_at, updated_at
      ) VALUES (?, NULL, 'pearapi', 'test', '[]', 'pending', ?, ?, ?)
    `).run(project.id, 'task-dead-1', now, now);

    const items = services.images.list(project.id);
    assert.equal(items.some((item) => item.status === 'pending' || item.status === 'processing'), false);
    assert.equal(items[0]?.status, 'failed');
    assert.match(String(items[0]?.error_msg), /服务重启中断了任务/);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
