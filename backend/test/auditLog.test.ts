import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { configureAuditLog, sanitizeAuditValue } from '../src/auditLog';
import logger from '../src/logger';

test('Everything 日志持久追加 JSONL 并统一脱敏凭据、查询串与二进制内容', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-audit-'));
  const file = path.join(directory, 'everything.log');
  try {
    configureAuditLog(file);
    logger.audit('test.everything', {
      api_key: 'sk-test',
      settings: { generation_key: 'generation-test' },
      authorization: 'Bearer test-token',
      source_url: 'https://cdn.example.test/file.png?signature=test',
      image: 'data:image/png;base64,AAAA',
      bytes: Buffer.from([1, 2, 3]),
      nested: { status: 'completed' },
    });
    const records = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.event, 'test.everything');
    const serialized = JSON.stringify(records[0]);
    assert.doesNotMatch(serialized, /sk-test|generation-test|test-token|signature=test|base64,AAAA/u);
    assert.match(serialized, /\[REDACTED\]/u);
    assert.match(serialized, /\[QUERY_REDACTED\]/u);
    assert.match(serialized, /\[DATA_URL/u);
    assert.match(serialized, /\[BINARY 3 bytes\]/u);
    assert.match(serialized, /completed/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Everything 日志清理循环对象与超长内容，不因无法序列化而中断', () => {
  const cyclic: Record<string, unknown> = { value: 'x'.repeat(3_000) };
  cyclic.self = cyclic;
  const sanitized = sanitizeAuditValue(cyclic);
  const serialized = JSON.stringify(sanitized);
  assert.match(serialized, /\[CIRCULAR\]/u);
  assert.match(serialized, /\[TRUNCATED 1000 chars\]/u);
});
