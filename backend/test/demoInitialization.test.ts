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

test('半成品 Demo 会原位补齐为结构化短剧工作区且重复初始化不创建第二个项目', () => {
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
        demo_contract: 'legacy-workspace',
      },
    });

    const repaired = initializeRainyNightDemo(db, services, logger);
    assert.equal(repaired.id, half.id);
    assert.equal(rainyNightDemoComplete(repaired), true);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
    assert.equal(repaired.metadata.demo_provider, undefined);
    assert.equal(repaired.project_assets?.length, 7);
    assert.equal(repaired.episodes?.[0]?.storyboards?.length, 5);
    assert.equal(repaired.episodes?.[0]?.storyboards?.every((shot) => shot.project_asset_ids.length > 0), true);
    assert.equal(repaired.episodes?.[0]?.storyboards?.every((shot) => shot.grid_rows === 3 && shot.grid_columns === 3), true);
    assert.equal(repaired.episodes?.[0]?.storyboards?.every((shot) => Boolean(shot.shot_size && shot.camera_angle && shot.composition && shot.image_prompt)), true);
    assert.equal(repaired.episodes?.[0]?.duration, 30);

    const repeated = initializeRainyNightDemo(db, services, logger);
    assert.equal(repeated.id, half.id);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
