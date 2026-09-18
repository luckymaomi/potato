import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/db/schema';
import { TaskService } from '../src/services/taskService';

test('任务阶段不伪造百分比，只公开显式报告的真实进度', async () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const tasks = new TaskService(db);
    const stageGate = deferred();
    const progressGate = deferred();
    const finishGate = deferred();
    const id = tasks.run('progress-contract', null, async (reporter) => {
      reporter.stage('正在等待供应商');
      stageGate.resolve();
      await progressGate.promise;
      reporter.progress(37, '供应商返回真实进度');
      await finishGate.promise;
      return { ok: true };
    });

    await stageGate.promise;
    const staged = tasks.get(id);
    assert.equal(staged?.message, '正在等待供应商');
    assert.equal(staged?.progress, undefined);
    assert.equal(Object.hasOwn(staged ?? {}, 'progress'), false);

    progressGate.resolve();
    await waitFor(() => tasks.get(id)?.progress === 37);
    assert.equal(tasks.get(id)?.message, '供应商返回真实进度');

    finishGate.resolve();
    await waitFor(() => tasks.get(id)?.status === 'completed');
    assert.equal(tasks.get(id)?.progress, 100);
  } finally {
    db.close();
  }
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('等待任务状态超时');
}
