import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config/index';

test('显式配置路径可隔离数据库与本地媒体目录', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-config-'));
  const configPath = path.join(root, 'isolated.yaml');
  fs.writeFileSync(configPath, [
    'app:',
    '  name: isolated-test',
    '  version: 1.0.0',
    'server:',
    '  port: 5679',
    'database:',
    '  path: ./state/test.db',
    'storage:',
    '  local_path: ./state/storage',
  ].join('\n'), 'utf8');
  const previous = process.env.POTATO_CONFIG_PATH;
  process.env.POTATO_CONFIG_PATH = configPath;
  try {
    const config = loadConfig();
    assert.equal(config.app.name, 'isolated-test');
    assert.equal(config.database.path, path.join(root, 'state', 'test.db'));
    assert.equal(config.storage?.local_path, path.join(root, 'state', 'storage'));
  } finally {
    if (previous === undefined) delete process.env.POTATO_CONFIG_PATH;
    else process.env.POTATO_CONFIG_PATH = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
