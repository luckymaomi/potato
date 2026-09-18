import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeRainyNightDemo, rainyNightDemoComplete } from '../scripts/rainyNightDemoRuntime';
import { initializeDatabase } from '../src/db/schema';
import { providerRegistry } from '../src/providers';
import { createServices } from '../src/services/container';
import type { AppConfig, Logger } from '../src/types/core';

test('accept:rainy-night-demo 只复用初始化入口，不保留供应商执行脚本', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(packageJson.scripts?.['accept:rainy-night-demo'], 'tsx scripts/initializeRainyNightDemo.ts');
  assert.equal(fs.existsSync(path.resolve('scripts/acceptRainyNightDemo.ts')), false);
});

test('同版本半成品 Demo 会原位补齐，重复初始化不创建第二个项目或覆盖完整画布', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-ai-drama-demo-init-'));
  const db = new Database(path.join(root, 'demo.db'));
  try {
    initializeDatabase(db);
    const config: AppConfig = {
      app: { name: 'demo-test', version: '1' },
      server: {},
      database: { path: path.join(root, 'demo.db') },
      storage: { local_path: path.join(root, 'storage') },
    };
    const logger: Logger = { info() {}, warn() {}, error() {}, audit() {} };
    const services = createServices(db, config, providerRegistry, logger);
    const half = services.projects.create({
      title: '半成品 Demo',
      metadata: {
        demo: true,
        demo_version: 15,
        canvas_layout: { workspace_nodes: [], edges: [], workflow_groups: [] },
      },
    });

    const repaired = initializeRainyNightDemo(db, services, logger);
    assert.equal(repaired.id, half.id);
    assert.equal(rainyNightDemoComplete(repaired), true);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
    const snapshot = repaired.metadata.canvas_layout as { workspace_nodes: unknown[]; edges: unknown[]; workflow_groups: unknown[] };
    assert.equal(snapshot.workspace_nodes.length, 36);
    assert.equal(snapshot.edges.length, 56);
    assert.equal(snapshot.workflow_groups.length, 1);

    const revision = repaired.canvas_revision;
    const repeated = initializeRainyNightDemo(db, services, logger);
    assert.equal(repeated.id, half.id);
    assert.equal(repeated.canvas_revision, revision);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
