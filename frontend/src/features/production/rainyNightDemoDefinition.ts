export const RAINY_NIGHT_DEMO = {
  templateId: 'rainy-night-delivery-demo',
  contract: 'structured-short-drama-workspace',
  project: {
    title: '《雨夜外卖》制作 Demo',
    description: '暴雨夜，外卖员小林送错外卖，闯进女总裁苏晴的办公室，两人因此认识。',
    genre: '都市偶遇微短剧',
    style: 'realistic',
  },
  media: {
    aspectRatio: '9:16',
    storyboardAspectRatio: '1:1',
    duration: 15,
  },
  story: '暴雨夜，外卖员小林送错外卖，闯进女总裁苏晴的办公室，两人因此认识。',
  script: `第一场：雨夜街道
暴雨里，小林骑着电动车穿行。黄色外卖箱绑在后座，手机忽然响起催单提示。
小林低头看了一眼手机。雨太大，他看不清路，拐错了弯。

第二场：写字楼大厅
小林浑身湿透，拎着外卖箱冲进大厅。保安伸手拦住他。
保安：外卖只能放前台。
小林：这单是 38 楼客户要求必须送上去。
保安的电话响了。小林趁保安接电话，溜进电梯。

第三场：总裁办公室
苏晴坐在办公桌后，对面站着两个股东，桌上放着合同。
股东甲：这份合同今天必须签。
苏晴没有说话，握着笔没有动。

第四场：总裁办公室
门被推开，小林拎着外卖箱进来。
小林：您好，您的外卖。
所有人都愣住了。苏晴抬头看他。
苏晴：我没点外卖。
小林低头看手机。
小林：38 楼苏晴，没错啊。
股东甲皱眉。
股东甲：这是怎么回事？
苏晴看了小林一眼，突然笑了一下。
苏晴：是我点的，先放这吧。
小林把外卖箱放在桌上，转身离开。苏晴看着他的背影。`,
  characters: [
    {
      name: '小林',
      description: '男，22岁，外卖员。',
      appearance: '黄色外卖服，黑框眼镜，头发被雨淋湿，看起来有点狼狈。',
      assetPrompt: '一个22岁的男外卖员，穿黄色外卖服，戴黑框眼镜，头发被雨淋湿，站在纯色背景前，正面半身像，写实风格。',
    },
    {
      name: '苏晴',
      description: '女，28岁，女总裁。',
      appearance: '白色西装，红唇，冷脸，气场强。',
      assetPrompt: '一个28岁的女总裁，穿白色西装，红唇，冷脸，气场强，站在纯色背景前，正面半身像，写实风格。',
    },
    {
      name: '股东甲',
      description: '男，50岁，股东。',
      appearance: '深色西装，表情严肃。',
      assetPrompt: '一个50岁的男股东，穿深色西装，表情严肃，站在纯色背景前，正面半身像，写实风格。',
    },
    {
      name: '保安',
      description: '男，35岁，写字楼保安。',
      appearance: '穿保安制服。',
      assetPrompt: '一个35岁的男保安，穿现代写字楼保安制服，站在纯色背景前，正面半身像，写实风格。',
    },
  ],
  scenes: [
    { location: '雨夜街道', prompt: '雨夜街道，暴雨，昏黄路灯，湿漉漉的柏油路，无人，写实风格。' },
    { location: '写字楼大厅', prompt: '现代写字楼大厅，冷色灯光，大理石地面，无人，写实风格。' },
    { location: '总裁办公室', prompt: '一间总裁办公室，38楼，落地窗，黑色办公桌，冷色灯光，窗外是城市夜景，无人，写实风格。' },
  ],
  props: [
    { name: '外卖箱', description: '黄色旧外卖箱。', prompt: '一个黄色的旧外卖箱，有划痕，边角磨损，放在纯色背景前，写实风格。' },
    { name: '合同', description: '放在办公桌上的合同。', prompt: '一个白色合同文件夹，放在纯色背景前，写实风格。' },
    { name: '电动车', description: '小林骑的旧电动车。', prompt: '一辆旧电动车，后座绑着黄色外卖箱，放在纯色背景前，写实风格。' },
  ],
  storyboards: [
    { title: '镜头1｜雨夜骑行', description: '雨夜街道全景，暴雨，小林骑着电动车，外卖箱绑在后座，路灯昏黄。', characters: ['小林'], scenes: ['雨夜街道'], props: ['电动车', '外卖箱'] },
    { title: '镜头2｜催单来电', description: '小林近景，手机响了，他低头看了一眼皱眉，雨打在他脸上。', characters: ['小林'], scenes: ['雨夜街道'], props: [] },
    { title: '镜头3｜闯进大厅', description: '写字楼大厅中景，小林浑身湿透拎着外卖箱冲进大厅，保安伸手拦住他。', characters: ['小林', '保安'], scenes: ['写字楼大厅'], props: ['外卖箱'] },
    { title: '镜头4｜合同施压', description: '总裁办公室中景，苏晴坐在办公桌后，两个股东站在对面，桌上放着合同。', characters: ['苏晴', '股东甲'], scenes: ['总裁办公室'], props: ['合同'] },
    { title: '镜头5｜握笔不签', description: '苏晴近景，她握着笔没动，表情冷。', characters: ['苏晴'], scenes: ['总裁办公室'], props: ['合同'] },
    { title: '镜头6｜意外闯入', description: '办公室门口全景，门被推开，小林拎着外卖箱进来，所有人都愣住了。', characters: ['小林', '苏晴', '股东甲'], scenes: ['总裁办公室'], props: ['外卖箱'] },
    { title: '镜头7｜苏晴抬头', description: '苏晴近景，她抬头看小林，愣了一下；画面只出现苏晴。', characters: ['苏晴'], scenes: ['总裁办公室'], props: [] },
    { title: '镜头8｜核对地址', description: '小林中景，他低头看手机，一脸困惑。', characters: ['小林'], scenes: ['总裁办公室'], props: [] },
    { title: '镜头9｜突然一笑', description: '苏晴近景，她看了小林一眼，突然笑了一下；画面只出现苏晴。', characters: ['苏晴'], scenes: ['总裁办公室'], props: [] },
    { title: '镜头10｜背影离开', description: '全景，小林转身离开，苏晴看着他的背影，桌旁放着外卖箱。', characters: ['小林', '苏晴'], scenes: ['总裁办公室'], props: ['外卖箱'] },
  ].map((shot) => ({
    ...shot,
    action: shot.description,
    dialogue: '',
    image_prompt: `${shot.description} 九宫格故事板，3x3九宫格分镜构图，1:1方形画幅，九个连续镜头讲述同一段情节，写实风格。`,
    video_prompt: `${shot.description} 镜头自然运动，人物动作连贯。`,
    duration: 15,
  })),
} as const

export type RainyNightDemoDefinition = typeof RAINY_NIGHT_DEMO
