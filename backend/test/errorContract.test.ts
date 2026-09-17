import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { parseStoredError, resolveError, serializeError } from '../src/errorContract';
import { initializeDatabase } from '../src/db/schema';
import { ProviderError } from '../src/providers/errors';
import { TaskService } from '../src/services/taskService';

test('统一错误合同保留供应商状态、身份和重试属性', () => {
  const resolved = resolveError(new ProviderError({
    providerId: 'agnes',
    code: 'http_error',
    message: '供应商请求失败（HTTP 429）：rate limited',
    httpStatus: 429,
    retryable: true,
  }));

  assert.equal(resolved.responseStatus, 502);
  assert.deepEqual(resolved.error, {
    code: 'http_error',
    message: '供应商请求失败（HTTP 429）：rate limited',
    status: 429,
    retryable: true,
    provider: 'agnes',
  });
  assert.deepEqual(parseStoredError(serializeError(new Error('HTTP 503 unavailable'))), {
    code: 'HTTP_503',
    message: 'HTTP 503 unavailable',
    status: 503,
    retryable: true,
  });
});

test('异步任务失败同时返回可读文本和结构化 failure', async () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const tasks = new TaskService(db);
    const id = tasks.run('test', null, async () => {
      throw new ProviderError({
        providerId: 'pearapi',
        code: 'http_error',
        message: '供应商请求失败（HTTP 404）：model not found',
        httpStatus: 404,
      });
    });

    const task = await waitForFailure(tasks, id);
    assert.equal(task.error, '供应商请求失败（HTTP 404）：model not found');
    assert.deepEqual(task.failure, {
      code: 'http_error',
      message: '供应商请求失败（HTTP 404）：model not found',
      status: 404,
      retryable: false,
      provider: 'pearapi',
    });
  } finally {
    db.close();
  }
});

async function waitForFailure(tasks: TaskService, id: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const task = tasks.get(id);
    if (task?.status === 'failed') return task;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('任务没有按预期失败');
}
