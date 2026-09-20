import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleStoryboardRecipes } from '../src/services/storyboardPromptAssembler';
import type { ProjectAssetRow, StoryboardRow } from '../src/types/domain';

const shot = (overrides: Partial<StoryboardRow> = {}): StoryboardRow => ({
  id: 1,
  episode_id: 1,
  storyboard_number: 1,
  title: '雾中的码头',
  description: '林岚在雾港码头发现一封没有寄件人的信',
  action: '她缓慢拆开信封，回头确认身后无人',
  dialogue: '你终于来了。',
  image_prompt: '电影感悬疑画面',
  video_prompt: '人物从静止到缓慢拆信',
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
  project_asset_ids: [7, 8, 9],
  extra_reference_images: ['https://cdn.test/pose.png', 'https://cdn.test/harbor.png'],
  created_at: '',
  updated_at: '',
  ...overrides,
});

const asset = (overrides: Partial<ProjectAssetRow>): ProjectAssetRow => ({
  id: 7,
  drama_id: 1,
  kind: 'character',
  name: '林岚',
  text_profile: {},
  input_reference_images: [],
  image_url: null,
  local_path: null,
  current_image_generation_id: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});

const assets: ProjectAssetRow[] = [
  asset({
    id: 7,
    kind: 'character',
    name: '林岚',
    text_profile: {
      occupation: '调查记者',
      hairstyle: '利落短发',
      default_outfit: '深色风衣',
      voice_tone_id: 'calm-low',
    },
    input_reference_images: ['https://cdn.test/raw-face.png'],
    image_url: 'https://cdn.test/linlan.png',
  }),
  asset({
    id: 8,
    kind: 'scene',
    name: '雾港码头',
    text_profile: {
      location_type: '旧码头',
      time_of_day: '凌晨',
      weather: '浓雾',
    },
    input_reference_images: ['https://cdn.test/raw-harbor.png'],
    image_url: 'https://cdn.test/harbor.png',
  }),
  asset({
    id: 9,
    kind: 'prop',
    name: '无名信封',
    text_profile: {
      category: '信件',
      material: '泛黄牛皮纸',
      special_marks: '暗红火漆',
    },
    image_url: 'https://cdn.test/letter.png',
  }),
];

test('分镜台一次编译图片与视频两份独立配方', () => {
  const result = assembleStoryboardRecipes({ shot: shot(), assets });

  assert.deepEqual(result, {
    imageRecipe: {
      imagePrompt: [
        '电影感悬疑画面',
        '角色卡「林岚」：职业：调查记者；发型：利落短发；默认穿搭：深色风衣；音色 ID：calm-low',
        '场景卡「雾港码头」：地点类型：旧码头；时间段：凌晨；天气：浓雾',
        '道具卡「无名信封」：类别：信件；材质：泛黄牛皮纸；特殊标记：暗红火漆',
        '景别：中近景',
        '机位：低机位',
        '构图：前景铁栏，中景人物，远景雾港灯塔',
        '动作：她缓慢拆开信封，回头确认身后无人',
        '光线：冷蓝月光与昏黄码头灯交错',
        '氛围：压抑、悬疑',
      ].join('\n'),
      imageReferences: [
        'https://cdn.test/linlan.png',
        'https://cdn.test/harbor.png',
        'https://cdn.test/letter.png',
        'https://cdn.test/pose.png',
      ],
    },
    videoRecipe: {
      videoPrompt: [
        '人物从静止到缓慢拆信',
        '角色卡「林岚」：职业：调查记者；发型：利落短发；默认穿搭：深色风衣；音色 ID：calm-low',
        '场景卡「雾港码头」：地点类型：旧码头；时间段：凌晨；天气：浓雾',
        '道具卡「无名信封」：类别：信件；材质：泛黄牛皮纸；特殊标记：暗红火漆',
        '景别：中近景',
        '机位：低机位',
        '运镜：缓慢推进',
        '构图：前景铁栏，中景人物，远景雾港灯塔',
        '动作：她缓慢拆开信封，回头确认身后无人',
        '光线：冷蓝月光与昏黄码头灯交错',
        '氛围：压抑、悬疑',
        '声音：海雾汽笛、脚步声',
        '对白：你终于来了。',
      ].join('\n'),
      videoReferences: [
        'https://cdn.test/linlan.png',
        'https://cdn.test/harbor.png',
        'https://cdn.test/letter.png',
        'https://cdn.test/pose.png',
      ],
    },
  });
});

test('空规格回退镜头描述并得到可直接消费的配方', () => {
  const result = assembleStoryboardRecipes({
    shot: shot({
      description: '一个人站在码头',
      image_prompt: null,
      video_prompt: null,
      action: null,
      dialogue: null,
      shot_size: null,
      camera_angle: null,
      camera_movement: null,
      composition: null,
      lighting: null,
      mood: null,
      sound: null,
      project_asset_ids: [],
      extra_reference_images: [' https://cdn.test/light.png ', 'https://cdn.test/light.png', ''],
    }),
    assets: [],
  });

  assert.deepEqual(result, {
    imageRecipe: {
      imagePrompt: '一个人站在码头',
      imageReferences: ['https://cdn.test/light.png'],
    },
    videoRecipe: {
      videoPrompt: '一个人站在码头',
      videoReferences: ['https://cdn.test/light.png'],
    },
  });
});
