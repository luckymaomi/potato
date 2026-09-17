import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductionCommand } from '../src/production/commands';

test('生产命令解析器把 HTTP 字段转换成内部领域命令', () => {
  assert.deepEqual(parseProductionCommand({
    kind: 'image',
    project_id: 7,
    mode: 'image-to-image',
    prompt: '保持人物一致',
    reference_images: ['https://cdn.test/ref.png', 'https://cdn.test/ref.png'],
    target: { kind: 'character', id: 11 },
  }), {
    kind: 'image',
    projectId: 7,
    mode: 'image-to-image',
    prompt: '保持人物一致',
    aspectRatio: undefined,
    referenceImages: ['https://cdn.test/ref.png'],
    target: { kind: 'character', id: 11 },
    provider: undefined,
    model: undefined,
  });
});

test('生产命令解析器集中拒绝无参考图的图生媒体和未知命令', () => {
  assert.throws(() => parseProductionCommand({
    kind: 'video', project_id: 7, mode: 'image-to-video', prompt: '人物转身', reference_images: [],
  }), /至少需要一张参考图/u);
  assert.throws(() => parseProductionCommand({ kind: 'unsupported', project_id: 7 }), /未知生产命令/u);
});
