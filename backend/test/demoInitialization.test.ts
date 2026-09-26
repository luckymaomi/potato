import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeQueenAccessionDemo, queenAccessionDemoComplete } from '../scripts/queenAccessionDemoRuntime';
import { initializeDatabase } from '../src/db/schema';
import { providerRegistry } from '../src/providers';
import { createServices } from '../src/services/container';
import type { AppConfig, Logger } from '../src/types/core';

test('accept:queen-accession-demo 只复用初始化入口，不保留供应商执行脚本', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(packageJson.scripts?.['accept:queen-accession-demo'], 'tsx scripts/initializeQueenAccessionDemo.ts');
  assert.equal(fs.existsSync(path.resolve('scripts/acceptRainyNightDemo.ts')), false);
});

test('半成品 Demo 会原位补齐为结构化漫画工作区且重复初始化不创建第二个项目', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-demo-init-'));
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

    const repaired = initializeQueenAccessionDemo(db, services, logger);
    assert.equal(repaired.id, half.id);
    assert.equal(queenAccessionDemoComplete(repaired), true);
    assert.equal(repaired.title, '《女王出浴》制作示例');
    assert.equal(repaired.story_hook.includes('浴后'), true);
    assert.equal(repaired.worldview.includes('浴室'), true);
    assert.equal(repaired.reference_setting.includes('真人'), true);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
    assert.equal(repaired.metadata.demo_provider, undefined);
    assert.equal(repaired.project_assets?.length, 3);
    assert.equal(repaired.episodes?.[0]?.panels?.length, 1);
    assert.equal(repaired.episodes?.[0]?.panels?.every((shot) => shot.project_asset_ids.length === 3), true);
    assert.deepEqual(
      repaired.project_assets?.map((asset) => `${asset.kind}:${asset.name}`).sort(),
      ['character:女王', 'prop:备用巾', 'scene:浴室'],
    );
    const characterKeys = ['brief'];
    const sceneKeys = ['brief'];
    const propKeys = ['brief'];
    for (const asset of repaired.project_assets ?? []) {
      const expected = asset.kind === 'character' ? characterKeys : asset.kind === 'scene' ? sceneKeys : propKeys;
      assert.deepEqual(Object.keys(asset.text_profile).sort(), [...expected].sort());
      assert.equal(expected.every((key) => Boolean(asset.text_profile[key]?.trim())), true);
      assert.equal(Boolean(asset.output_prompt?.trim()), true);
    }
    assert.equal(repaired.project_assets?.find((asset) => asset.kind === 'character')?.output_type, 'character-layout-a');
    assert.equal(repaired.project_assets?.find((asset) => asset.kind === 'scene')?.output_type, 'scene-panorama');
    assert.equal(repaired.project_assets?.find((asset) => asset.kind === 'prop')?.output_type, 'prop-multi-angle');
    assert.equal(repaired.episodes?.[0]?.panels?.every((shot) => Boolean(shot.action && shot.image_prompt)), true);
    assert.equal(repaired.episodes?.[0]?.duration, 6);
    assert.equal(repaired.episodes?.[0]?.title, '第 1 话｜女王出浴');
    assert.equal(repaired.episodes?.[0]?.episode_goal.includes('出浴'), true);

    const repeated = initializeQueenAccessionDemo(db, services, logger);
    assert.equal(repeated.id, half.id);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
