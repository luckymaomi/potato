export const RAINY_NIGHT_DEMO = {
  templateId: 'mist-harbor-letter-demo',
  contract: 'mystery-storyboard-workspace-v1',
  project: {
    title: '《雾港来信》制作 Demo',
    description: '调查记者林岚在雾港收到一封没有寄件人的信，信中预告了当晚即将发生的失踪。',
    genre: '悬疑短剧',
    style: 'cinematic-mystery',
  },
  media: {
    aspectRatio: '9:16',
    storyboardAspectRatio: '1:1',
    duration: 6,
  },
  story: '凌晨的雾港，调查记者林岚收到一封没有寄件人的信。信中只有一句话：不要让钟声响第三次。',
  script: `第一场：雾港码头\n凌晨，浓雾封住旧码头。林岚沿着铁栏走来，手里攥着一封湿冷的信。\n\n第二场：旧仓库门口\n林岚借着灯光拆开信封，发现里面只有一张写着“第三声钟响前离开”的纸。远处传来第一声钟响。\n\n第三场：灯塔下\n她抬头看向灯塔，雾里出现一个提灯的人影。第二声钟响，人影突然熄灭。\n\n第四场：码头栈桥\n林岚转身逃向栈桥，脚边多出一只旧录音机。录音机自动播放她昨天采访失踪者的声音。\n\n第五场：雾散之前\n第三声钟响前，林岚回头看见信封背面浮出一行新字：下一个是你。`,
  characters: [
    { name: '林岚', description: '女，30岁，调查记者。', appearance: '深色风衣，短发，疲惫但警觉。', assetPrompt: '写实电影感，30岁调查记者，深色风衣，短发，警觉神情，纯色背景半身像。' },
    { name: '提灯人', description: '身份不明的远处人影。', appearance: '被浓雾遮住面孔，只能看见旧提灯。', assetPrompt: '写实电影感，雾中身份不明的提灯人，面孔不可辨认，旧提灯，纯色背景。' },
  ],
  scenes: [
    { location: '雾港码头', prompt: '凌晨旧码头，浓雾、湿冷铁栏、远处灯塔与微弱航标灯，悬疑写实风格。' },
    { location: '旧仓库门口', prompt: '废弃仓库门口，单盏昏黄壁灯，潮湿木门和生锈锁链，悬疑写实风格。' },
    { location: '灯塔下', prompt: '雾中的旧灯塔，地面湿滑，远处只有提灯人影，冷蓝月光，悬疑写实风格。' },
  ],
  props: [
    { name: '无名信封', description: '被海水打湿的旧信封。', prompt: '湿冷泛黄的无名信封，边角磨损，没有寄件人信息，写实特写。' },
    { name: '旧录音机', description: '会自动播放录音的旧录音机。', prompt: '掌心大小的老式磁带录音机，金属划痕，红色播放指示灯，写实静物。' },
  ],
  storyboards: [
    { title: '镜头1｜雾港来信', description: '林岚沿着雾港铁栏走来，手里攥着湿冷的无名信封，远处灯塔若隐若现。', characters: ['林岚'], scenes: ['雾港码头'], props: ['无名信封'], shot_size: '远景', camera_angle: '平视', camera_movement: '缓慢跟拍', composition: '铁栏形成引导线，人物位于画面右侧，灯塔在雾中作背景', lighting: '冷蓝月光与航标灯', mood: '压抑、未知', sound: '海雾汽笛与脚步踩水声' },
    { title: '镜头2｜第一声钟响', description: '林岚在旧仓库门口拆开信封，纸上写着第三声钟响前离开，远处传来第一声钟响。', characters: ['林岚'], scenes: ['旧仓库门口'], props: ['无名信封'], shot_size: '近景', camera_angle: '俯拍', camera_movement: '从信纸慢慢推向林岚的眼睛', composition: '信纸占据前景，林岚的眼睛在后景失焦后重新清晰', lighting: '单盏昏黄壁灯', mood: '紧张、被监视', sound: '第一声钟响、纸张摩擦声' },
    { title: '镜头3｜雾中提灯人', description: '灯塔下的浓雾里出现一个提灯人影，第二声钟响后人影突然熄灭。', characters: ['林岚', '提灯人'], scenes: ['灯塔下'], props: [], shot_size: '中远景', camera_angle: '低机位', camera_movement: '轻微横移后突然停住', composition: '灯塔居中，提灯人影位于雾幕中央，林岚只露出前景肩部', lighting: '冷蓝月光，提灯暖光', mood: '诡异、屏息', sound: '第二声钟响、风穿过灯塔的低鸣' },
    { title: '镜头4｜栈桥上的录音', description: '林岚逃向码头栈桥，脚边突然多出一只旧录音机，自动播放她昨天采访失踪者的声音。', characters: ['林岚'], scenes: ['雾港码头'], props: ['旧录音机'], shot_size: '中景', camera_angle: '手持低机位', camera_movement: '急促跟拍后俯冲到录音机', composition: '栈桥线条把视线引向黑暗水面，录音机压在前景角落', lighting: '断续航标灯与录音机红色指示灯', mood: '惊恐、失控', sound: '急促脚步、磁带杂音、失踪者录音' },
    { title: '镜头5｜下一个是你', description: '第三声钟响前林岚回头，信封背面浮出一行新字：下一个是你。', characters: ['林岚'], scenes: ['雾港码头'], props: ['无名信封'], shot_size: '特写', camera_angle: '正面平视', camera_movement: '缓慢推进到信封文字', composition: '信封贴近镜头，林岚惊恐的眼睛倒映在湿润纸面上', lighting: '雾散前的灰白天光', mood: '寒意、悬念', sound: '第三声钟响前的寂静与远处水滴声' },
  ].map((shot) => ({
    ...shot,
    action: shot.description,
    dialogue: '',
    image_prompt: `${shot.description}，生成清晰的3x3九宫格分镜图，九个格子保持角色与场景一致，按阅读顺序表达这一镜的连续动作。`,
    video_prompt: `${shot.description}。单一连续画面，首帧自然延续为连贯运动镜头；不要九宫格、不要分格、不要拼贴、不要多画面。`,
    duration: 6,
  })),
} as const

export type RainyNightDemoDefinition = typeof RAINY_NIGHT_DEMO
