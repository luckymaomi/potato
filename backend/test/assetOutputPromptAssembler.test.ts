import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleAssetOutputPrompt } from '../src/services/assetOutputPromptAssembler';
import type { AssetOutputType, ProjectAssetRow } from '../src/types/domain';

function asset(outputType: AssetOutputType): ProjectAssetRow {
  const kind = outputType.startsWith('character-')
    ? 'character'
    : outputType.startsWith('scene-') ? 'scene' : 'prop';
  return {
    id: 1,
    drama_id: 1,
    kind,
    name: kind === 'character' ? '红女王（加冕）' : kind === 'scene' ? '黑曜王厅（烛光）' : '红宝石王冠（破损）',
    text_profile: kind === 'character'
      ? { hairstyle: '黑色盘发', default_outfit: '深红加冕礼服' }
      : kind === 'scene'
        ? { layout: '中轴王座厅', time_of_day: '深夜', light_source: '烛光' }
        : { material: '暗金与红宝石', default_state: '左侧冠齿破损' },
    output_type: outputType,
    input_reference_images: [],
    image_url: null,
    local_path: null,
    current_image_generation_id: null,
    created_at: '',
    updated_at: '',
  };
}

test('角色卡四种布局生成各自的标准图册产出提示词', () => {
  const cases: Array<[AssetOutputType, RegExp]> = [
    ['character-layout-a', /三栏三视图.*左栏.*正面.*中栏.*背面.*右栏.*头部/u],
    ['character-layout-b', /左脸右身.*正脸特写.*正面.*90度侧面.*背面/u],
    ['character-layout-c', /4\+3 双层.*第一排.*四张全身图.*第二排.*三张头部特写/u],
    ['character-layout-d', /7 图身份锚点组.*正面肖像.*四分之三侧面.*手部特写/u],
  ];

  for (const [outputType, layoutPattern] of cases) {
    const prompt = assembleAssetOutputPrompt(asset(outputType));
    assert.match(prompt, layoutPattern);
    assert.match(prompt, /同一张脸、同一发型、同一服装/u);
    assert.match(prompt, /身高比例和五官完全一致/u);
    assert.match(prompt, /纯色或中性背景/u);
  }
});

test('场景卡三种产出类型生成可直接执行的独立卡提示词', () => {
  const panorama = assembleAssetOutputPrompt(asset('scene-panorama'));
  const detail = assembleAssetOutputPrompt(asset('scene-detail'));
  const lighting = assembleAssetOutputPrompt(asset('scene-lighting-variant'));

  assert.match(panorama, /空间全景图.*整体布局.*空间关系.*建筑风格/u);
  assert.match(detail, /局部特写图.*关键陈设.*材质.*光影细节/u);
  assert.match(lighting, /光影变体卡.*独立 ID.*一种光影设定/u);
});

test('道具卡两种产出类型生成多角度或独立状态卡提示词', () => {
  const multiAngle = assembleAssetOutputPrompt(asset('prop-multi-angle'));
  const stateVariant = assembleAssetOutputPrompt(asset('prop-state-variant'));

  assert.match(multiAngle, /多角度图.*正面.*侧面.*局部特写/u);
  assert.match(stateVariant, /状态变体卡.*独立 ID.*一种道具状态/u);
});
