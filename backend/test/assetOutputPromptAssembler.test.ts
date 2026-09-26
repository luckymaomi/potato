import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleAssetOutputPrompt,
  normalizeBanImageText,
  normalizeReferenceLock,
} from '../src/services/assetOutputPromptAssembler';
import type { AssetOutputType, ProjectAssetRow } from '../src/types/domain';

function asset(
  outputType: AssetOutputType,
  referenceLock: 'face' | 'scene' | 'prop' | null = null,
  banImageText: 'ban' | null = null,
): ProjectAssetRow & {
  reference_lock: 'face' | 'scene' | 'prop' | null;
  ban_image_text: 'ban' | null;
} {
  const kind = outputType.startsWith('character-')
    ? 'character'
    : outputType.startsWith('scene-') ? 'scene' : 'prop';
  return {
    id: 1,
    drama_id: 1,
    kind,
    name: kind === 'character' ? '红女王（加冕）' : kind === 'scene' ? '黑曜王厅（烛光）' : '红宝石王冠（破损）',
    text_profile: kind === 'character'
      ? { brief: '黑色盘发；深红加冕礼服' }
      : kind === 'scene'
        ? { brief: '中轴王座厅；深夜烛火' }
        : { brief: '暗金与红宝石；左侧冠齿破损' },
    output_type: outputType,
    output_prompt: '测试提示词',
    input_reference_images: [],
    image_url: null,
    local_path: null,
    current_image_generation_id: null,
    created_at: '',
    updated_at: '',
    reference_lock: referenceLock,
    ban_image_text: banImageText,
  };
}

test('未选图片参考锁定时不组装锁定段', () => {
  assert.equal(normalizeReferenceLock('character', null), null);
  assert.equal(normalizeReferenceLock('character', undefined), null);
  const prompt = assembleAssetOutputPrompt(asset('character-layout-c', null));
  assert.equal(/图片参考锁定|img2img/u.test(prompt), false);
  assert.match(prompt, /产出布局 C/u);
});

test('选中锁脸后组装写入最前；布局仍按预设', () => {
  const prompt = assembleAssetOutputPrompt(asset('character-layout-b', 'face'));
  assert.match(prompt, /^图片参考锁定（锁脸）：以我上传的参考图为唯一面部身份锚点，img2img 图生图。/u);
  assert.match(prompt, /发际线与发型轮廓一致/u);
  assert.match(prompt, /左脸右身/u);
});

test('场景选锁景、道具选锁物', () => {
  assert.match(
    assembleAssetOutputPrompt(asset('scene-panorama', 'scene')),
    /^图片参考锁定（锁景）：以我上传的参考图为唯一场景锚点，img2img 图生图。/u,
  );
  assert.match(
    assembleAssetOutputPrompt(asset('prop-multi-angle', 'prop')),
    /^图片参考锁定（锁物）：以我上传的参考图为唯一道具锚点，img2img 图生图。/u,
  );
});

test('未选画面禁字时不组装禁字段', () => {
  assert.equal(normalizeBanImageText(null), null);
  assert.equal(normalizeBanImageText(undefined), null);
  const prompt = assembleAssetOutputPrompt(asset('character-layout-a', null, null));
  assert.equal(/禁止出字|可读字符/u.test(prompt), false);
});

test('选中禁止出字后写入锁定段之后、卡面文本之前', () => {
  const prompt = assembleAssetOutputPrompt(asset('character-layout-a', 'face', 'ban'));
  assert.match(
    prompt,
    /^图片参考锁定（锁脸）：[\s\S]*?\n画面约束（禁止出字）：图像中不得出现任何文字/u,
  );
  assert.match(prompt, /水印、招牌字、标签、气泡或其它可读字符/u);
  assert.match(prompt, /产出布局 A/u);
});
