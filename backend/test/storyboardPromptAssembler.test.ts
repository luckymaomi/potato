import assert from 'node:assert/strict';
import test from 'node:test';
import { assemblePanelRecipe } from '../src/services/storyboardPromptAssembler';
import type { PanelRow, ProjectAssetRow } from '../src/types/domain';

const panel = (overrides: Partial<PanelRow> = {}): PanelRow => ({
  id: 1, episode_id: 1, panel_number: 1, title: '雾中的码头', description: '林岚在雾港码头发现一封信', action: '拆开信封', image_prompt: '电影感悬疑画面', image_recipe_prompt: '', image_recipe_references: [], image_url: null, current_image_generation_id: null, project_asset_ids: [7], extra_reference_images: ['https://cdn.test/pose.png'], created_at: '', updated_at: '', ...overrides,
});
const assets: ProjectAssetRow[] = [{ id: 7, drama_id: 1, kind: 'character', name: '林岚', text_profile: { brief: '调查记者风衣' }, output_type: 'character-layout-a', output_prompt: '定妆', input_reference_images: [], image_url: 'https://cdn.test/linlan.png', local_path: null, current_image_generation_id: null, created_at: '', updated_at: '' }];

test('分镜配方只拼本镜画面，参考图挂资产标准图与其他参考图', () => {
  const result = assemblePanelRecipe({
    shot: panel(),
    assets,
  });
  assert.equal(
    result.panelRecipe.prompt,
    '拆开信封\n干净画面；无字幕、无气泡、无水印',
  );
  assert.deepEqual(result.panelRecipe.references, [
    'https://cdn.test/linlan.png',
    'https://cdn.test/pose.png',
  ]);
});

test('分镜配方不注入总览画风锁或资产档案文本', () => {
  const result = assemblePanelRecipe({
    shot: panel({
      action: '回眸而立',
      project_asset_ids: [7],
    }),
    assets,
  });
  assert.equal(/基调|参考设定|角色卡|服装：调查记者风衣|定妆/u.test(result.panelRecipe.prompt), false);
  assert.match(result.panelRecipe.prompt, /^回眸而立\n干净画面/);
});

test('空规格仍产出可执行的图片配方', () => {
  const result = assemblePanelRecipe({
    shot: panel({
      description: '一个人站在码头',
      image_prompt: null,
      action: null,
      project_asset_ids: [],
      extra_reference_images: [' https://cdn.test/light.png ', 'https://cdn.test/light.png'],
    }),
    assets: [],
  });
  assert.deepEqual(result.panelRecipe, {
    prompt: '一个人站在码头\n干净画面；无字幕、无气泡、无水印',
    references: ['https://cdn.test/light.png'],
  });
});
