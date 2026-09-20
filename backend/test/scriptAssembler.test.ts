import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleScriptScenes } from '../src/services/scriptAssembler';

test('人工场次按填写顺序组装为可编辑的本集剧本', () => {
  const script = assembleScriptScenes([
    { title: '第一场：雨夜归来', content: '城门打开。\n红女王走入夜城。' },
    { title: '第二场：王厅低头', content: '众人低头，摄政公爵仍然站立。' },
  ]);

  assert.equal(script, '第一场：雨夜归来\n城门打开。\n红女王走入夜城。\n\n第二场：王厅低头\n众人低头，摄政公爵仍然站立。');
});
