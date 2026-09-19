import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleStoryboardPrompts } from '../src/services/storyboardPromptAssembler';
import type { ProjectAssetRow, StoryboardRow } from '../src/types/domain';

const shot = (overrides: Partial<StoryboardRow> = {}): StoryboardRow => ({
  id: 1,
  episode_id: 1,
  storyboard_number: 1,
  title: '雾中的码头',
  description: '林岚在雾港码头发现一封没有寄件人的信',
  action: '她缓慢拆开信封，回头确认身后无人',
  dialogue: '“你终于来了。”',
  image_prompt: null,
  negative_prompt: '文字水印、额外人物',
  video_prompt: null,
  shot_size: '中近景',
  camera_angle: '低机位',
  camera_movement: '缓慢推进',
  composition: '前景铁栏，中景人物，远景雾港灯塔',
  lighting: '冷蓝月光与昏黄码头灯交错',
  mood: '压抑、悬疑',
  sound: '海雾汽笛、脚步声',
  image_url: null,
  video_url: null,
  current_image_generation_id: null,
  current_video_generation_id: null,
  grid_rows: 1,
  grid_columns: 1,
  character_ids: [],
  scene_ids: [],
  prop_ids: [],
  project_asset_ids: [7, 8],
  duration: 6,
  created_at: '',
  updated_at: '',
  ...overrides,
});

const assets = [
  { id: 7, kind: 'character', name: '林岚', description: '调查记者', appearance: '深色风衣，短发', prompt: null, visual_description: null, image_url: 'https://cdn.test/linlan.png' },
  { id: 8, kind: 'scene', name: '雾港码头', description: '凌晨的旧码头', appearance: null, prompt: '浓雾笼罩的旧码头，远处灯塔', visual_description: null, image_url: 'https://cdn.test/harbor.png' },
] as ProjectAssetRow[];

test('只填镜头语言时，图片和视频 prompt 都保留用户输入且按用途分层', () => {
  const result = assembleStoryboardPrompts({ shot: shot({ image_prompt: null, video_prompt: null }), assets });
  assert.match(result.imagePrompt, /中近景/);
  assert.match(result.imagePrompt, /低机位/);
  assert.match(result.imagePrompt, /前景铁栏/);
  assert.match(result.imagePrompt, /冷蓝月光/);
  assert.match(result.videoPrompt, /缓慢推进/);
  assert.match(result.videoPrompt, /海雾汽笛/);
  assert.deepEqual(result.imageReferences, ['https://cdn.test/linlan.png', 'https://cdn.test/harbor.png']);
  assert.deepEqual(result.videoReferences, []);
});

test('主体提示词作为主干，资产文本和分镜图引用不被覆盖', () => {
  const result = assembleStoryboardPrompts({
    shot: shot(),
    assets,
    imagePromptOverride: '电影感静态画面',
    videoPromptOverride: '手持镜头跟随',
    storyboardImageUrl: 'https://cdn.test/storyboard.png',
  });
  assert.match(result.imagePrompt, /^电影感静态画面/);
  assert.match(result.imagePrompt, /浓雾笼罩的旧码头/);
  assert.match(result.videoPrompt, /^手持镜头跟随/);
  assert.deepEqual(result.videoReferences, ['https://cdn.test/storyboard.png']);
  assert.equal(result.imageNegativePrompt, '文字水印、额外人物');
});

test('镜头语言全空时保持主体回退，不产生空标签', () => {
  const result = assembleStoryboardPrompts({
    shot: shot({
      description: '一个人站在码头', image_prompt: null, video_prompt: null,
      action: null, dialogue: null, shot_size: null, camera_angle: null, camera_movement: null,
      composition: null, lighting: null, mood: null, sound: null, project_asset_ids: [], negative_prompt: null,
    }),
    assets: [],
  });
  assert.match(result.imagePrompt, /^一个人站在码头/);
  assert.match(result.videoPrompt, /^一个人站在码头/);
});
