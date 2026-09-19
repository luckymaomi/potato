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

test('图片任务可全部并发而视频任务统一串行', async () => {
  const db = new Database(':memory:');
  try {
    initializeDatabase(db);
    const tasks = new TaskService(db);
    const imageGate = deferred();
    let startedImages = 0;
    const imageIds = Array.from({ length: 5 }, (_, index) => tasks.run('image_generation', String(index), async () => {
      startedImages += 1;
      await imageGate.promise;
      return { index };
    }));
    await waitFor(() => startedImages === 5);
    imageGate.resolve();
    await waitFor(() => imageIds.every((id) => tasks.get(id)?.status === 'completed'));

    const videoGates = [deferred(), deferred(), deferred()];
    let startedVideos = 0;
    let activeVideos = 0;
    let maximumActiveVideos = 0;
    const videoIds = videoGates.map((gate, index) => tasks.run('video_generation', String(index), async () => {
      startedVideos += 1;
      activeVideos += 1;
      maximumActiveVideos = Math.max(maximumActiveVideos, activeVideos);
      await gate.promise;
      activeVideos -= 1;
      return { index };
    }));
    await waitFor(() => startedVideos === 1);
    assert.equal(maximumActiveVideos, 1);
    videoGates[0]?.resolve();
    await waitFor(() => startedVideos === 2);
    videoGates[1]?.resolve();
    await waitFor(() => startedVideos === 3);
    videoGates[2]?.resolve();
    await waitFor(() => videoIds.every((id) => tasks.get(id)?.status === 'completed'));
    assert.equal(maximumActiveVideos, 1);
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
