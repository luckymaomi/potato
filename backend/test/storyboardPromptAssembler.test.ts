import assert from 'node:assert/strict';
import test from 'node:test';
import { assemblePanelRecipe } from '../src/services/storyboardPromptAssembler';
import type { PanelRow, ProjectAssetRow } from '../src/types/domain';

const panel = (overrides: Partial<PanelRow> = {}): PanelRow => ({
  id: 1, episode_id: 1, panel_number: 1, title: '雾中的码头', description: '林岚在雾港码头发现一封信', action: '拆开信封', expression: '警觉', image_prompt: '电影感悬疑画面', image_recipe_prompt: '', image_recipe_references: [], framing: '半身人物', viewpoint: '略低视角', composition: '人物居中', lighting: '冷蓝月光', mood: '压抑', image_url: null, current_image_generation_id: null, project_asset_ids: [7], extra_reference_images: ['https://cdn.test/pose.png'], created_at: '', updated_at: '', ...overrides,
});
const assets: ProjectAssetRow[] = [{ id: 7, drama_id: 1, kind: 'character', name: '林岚', text_profile: { occupation: '调查记者' }, output_type: 'character-layout-a', output_prompt: '定妆', input_reference_images: [], image_url: 'https://cdn.test/linlan.png', local_path: null, current_image_generation_id: null, created_at: '', updated_at: '' }];

test('分镜配方按画风锁、本镜动作与资产 ID 组装', () => {
  const result = assemblePanelRecipe({
    shot: panel(),
    assets,
    styleLock: { tone: '冷峻', reference_setting: '电影感' },
    previousPanelImage: 'https://cdn.test/prev.png',
  });
  assert.equal(
    result.panelRecipe.prompt,
    '基调：冷峻\n参考设定：电影感\n拆开信封\n角色卡「林岚」：职业：调查记者\n取景：半身人物\n构图：人物居中\n视角：略低视角\n表情：警觉\n光线：冷蓝月光\n氛围：压抑\n干净画面；无字幕、无气泡、无水印',
  );
  assert.deepEqual(result.panelRecipe.references, [
    'https://cdn.test/linlan.png',
    'https://cdn.test/pose.png',
    'https://cdn.test/prev.png',
  ]);
});

test('空规格仍产出可执行的图片配方', () => {
  const result = assemblePanelRecipe({
    shot: panel({
      description: '一个人站在码头',
      image_prompt: null,
      action: null,
      expression: null,
      framing: null,
      viewpoint: null,
      composition: null,
      lighting: null,
      mood: null,
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
