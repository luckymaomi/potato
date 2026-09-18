import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { MediaReferenceService } from '../src/services/mediaReferenceService';
import type { AppConfig } from '../src/types/core';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function createFixture(database?: Database.Database): { root: string; service: MediaReferenceService } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-ai-drama-media-'));
  fs.mkdirSync(path.join(root, 'uploads'));
  const config: AppConfig = {
    app: { name: 'test', version: '1' },
    server: {},
    database: { path: ':memory:' },
    storage: { local_path: root, base_url: 'http://localhost:5679/static' },
  };
  return { root, service: new MediaReferenceService(config, database) };
}

test('本地静态参考图会转换为带正确 MIME 的内联图片', async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fixture.root, 'uploads', 'reference.png'), ONE_PIXEL_PNG);

  const relative = await fixture.service.resolve('/static/uploads/reference.png', { format: 'inline' });
  const absolute = await fixture.service.resolve(
    'http://localhost:5679/static/uploads/reference.png',
    { format: 'inline' },
  );

  const expected = `data:image/png;base64,${ONE_PIXEL_PNG.toString('base64')}`;
  assert.equal(relative, expected);
  assert.equal(absolute, expected);
});

test('公网 URL 和已有内联图片按请求格式原样保留', async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const remote = 'https://cdn.test/reference.png';
  const inline = 'data:image/png;base64,AAAA';

  assert.equal(await fixture.service.resolve(remote, { format: 'inline' }), remote);
  assert.equal(await fixture.service.resolve(remote, { format: 'public-url' }), remote);
  assert.equal(await fixture.service.resolve(inline, { format: 'inline' }), inline);
  assert.equal(await fixture.service.resolve(inline, { format: 'public-url' }), undefined);
});

test('本地参考图不会伪装成远端可访问 URL', async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fixture.root, 'uploads', 'reference.png'), ONE_PIXEL_PNG);

  assert.equal(
    await fixture.service.resolve('/static/uploads/reference.png', { format: 'public-url' }),
    undefined,
  );
});

test('已落盘图片可按 generation 来源记录提供 Agnes 视频所需公网引用', async (t) => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE image_generations (
      id INTEGER PRIMARY KEY,
      local_path TEXT,
      source_url TEXT,
      status TEXT
    )
  `);
  database.prepare(`
    INSERT INTO image_generations (id, local_path, source_url, status)
    VALUES (?, ?, ?, ?)
  `).run(7, 'projects/1/images/7.png', 'https://cdn.test/generated-7.png', 'completed');
  const fixture = createFixture(database);
  t.after(() => {
    database.close();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  assert.equal(
    await fixture.service.resolve('/static/projects/1/images/7.png', { format: 'public-url' }),
    'https://cdn.test/generated-7.png',
  );
  assert.equal(
    await fixture.service.resolve('/static/uploads/reference.png', { format: 'public-url' }),
    undefined,
  );
});

test('本地参考图拒绝路径穿越、缺失文件和伪造图片', async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fixture.root, 'uploads', 'fake.png'), 'not an image');

  await assert.rejects(
    fixture.service.resolve('/static/../outside.png', { format: 'inline' }),
    /参考图路径越界/u,
  );
  await assert.rejects(
    fixture.service.resolve('/static/uploads/missing.png', { format: 'inline' }),
    /参考图文件不存在/u,
  );
  await assert.rejects(
    fixture.service.resolve('/static/uploads/fake.png', { format: 'inline' }),
    /仅支持 JPEG、PNG、GIF 或 WebP/u,
  );
});
