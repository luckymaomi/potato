export const RAINY_NIGHT_DEMO = {
  templateId: "queen-bath-demo",
  contract: "asset-output-pipeline-v9-queen-bath-subtle",
  project: {
    title: "《女王出浴》制作示例",
    description: "写实真人摄影风：女王浴后回眸的一格资产与分镜示例。",
    story_hook: "女王浴后离开浴池，在蒸汽中回眸。",
    worldview: "王室私人浴室：大理石浴池、暖雾、金饰壁灯。",
    storyline: "女王浴后回眸，蒸汽同框，完成出浴定格。",
    tone: "柔和暧昧、私密奢华、写实电影感",
    reference_setting:
      "严格真人实拍摄影质感，禁止动漫、二次元、漫画线稿、插画风；35mm 电影镜头；自然质感与真实光影；暖色蒸汽；造型稳定；画面禁止出字。",
    genre: "王室日常",
    style: "photoreal-cinematic-royal",
  },
  media: {
    aspectRatio: "9:16",
    panelAspectRatio: "1:1",
    duration: 6,
  },
  story:
    "王室浴室暖雾未散。成年真人女性女王刚离浴池，未着衣物，仅有蒸汽与水光，回眸一笑，完成这一格。",
  episodePlan: {
    episode_goal: "完成女王出浴这一格的写实真人资产标准图与分镜底板。",
    conflict: "蒸汽、水光与真人面部必须统一，禁止漂成动漫。",
    turning_point: "女王回眸，暖光勾出轮廓。",
    ending_hook: "出浴定格完成，可继续扩写。",
    scene_notes: "一格：女王出浴。",
  },
  script: `第一场：女王出浴
王室浴室蒸汽朦胧。成年真人女性女王刚离浴池，未着任何衣物，湿发贴肩，红唇微启，妩媚回眸，完成写实电影感定格。`,
  characters: [
    {
      name: "女王",
      output_prompt:
        "photorealistic live-action photograph of an adult real human woman queen just after leaving a warm bath, no clothing, no garments, only soft steam and water sheen, not anime, not cartoon, not illustration, not 2D. Black damp long hair, red lips, quiet seductive gaze over the shoulder, warm steamy royal bathroom, cinematic 35mm film look, natural texture, realistic lighting, tasteful fine-art figure study, no text, no watermark.",
      text_profile: {
        age: "成年",
        gender: "女",
        occupation: "王国女王",
        faction: "王室",
        face_shape: "精致鹅蛋脸，下颌柔和清晰",
        facial_features:
          "红唇微启，眉眼妩媚，睫毛带水汽，目光勾人而从容；真人五官，禁止二次元大眼",
        hairstyle: "黑色长发，浴后微湿贴肩，发梢滴水，真人发丝",
        body_type: "高挑匀称，收腰有致，沙漏型比例，写实真人体态，柔和曲线",
        skin_tone: "暖白，蒸汽晕红，水光与真实质感，禁止塑料感动漫肤色",
        default_outfit:
          "浴后未着任何衣物；无浴袍、无浴巾、无配饰；仅蒸汽与水珠勾勒轮廓；不戴王冠，不着鞋履",
        personality: "妩媚自信，私密场合从容",
        common_expressions: "回眸浅笑、微微眯眼、红唇轻启",
        aura: "暧昧奢华的女王气场；必须写实真人摄影，禁止动漫卡通插画",
      },
    },
  ],
  scenes: [
    {
      location: "浴室",
      output_prompt:
        "photorealistic live-action royal private bathroom panorama, marble bath pool, warm steam, golden wall sconces, wet floor reflections, empty room, cinematic lighting, real materials, no anime, no illustration, no text.",
      text_profile: {
        location_type: "王室私人浴室",
        layout: "中央大理石浴池，一侧台阶与毛巾架，门口隐于蒸汽后",
        architectural_style: "古典王室浴殿，石柱与金线嵌边，真实石材",
        scale: "私密中型空间，适合单人半身构图",
        time_of_day: "室内",
        light_source: "金色壁灯与柔光，蒸汽散射，体积光",
        color_temperature: "暖琥珀",
        contrast: "蒸汽柔光，高光落在水洼与金饰",
        key_furniture: "大理石浴池、台阶、石制盥洗台",
        props: "毛巾架、香氛瓶（远处，未使用）",
        decorations: "壁灯与浅浮雕纹样",
        vegetation: "角落少量绿植",
        palette: "象牙白、暖金、雾灰与水光",
        emotion: "私密、安静、奢华",
        weather: "室内高湿蒸汽；写实材质，禁止动漫背景",
      },
    },
  ],
  props: [
    {
      name: "浴巾",
      output_prompt:
        "photorealistic white bath towel still life on marble bench, thick soft cotton, unused, neat folds, real fabric texture, no anime, no text.",
      text_profile: {
        category: "浴室织物",
        size: "成人用大浴巾",
        material: "厚实棉质，真实织纹",
        color: "象牙白近纯白",
        shape: "长方形，折叠整齐",
        condition: "干净干燥，尚未使用",
        special_marks: "一角细小金色纹章",
        unique_design: "宽幅，褶皱自然",
        default_state: "叠放在石台上，未裹身",
        interaction_states: "静置；被拿起；仍未穿戴",
        bindings: "场景陈设；本格人物未使用它；写实布料",
      },
    },
  ],
  panels: [
    {
      title: "分格1｜女王出浴",
      description:
        "写实真人摄影：王室浴室蒸汽中，成年女性女王刚离浴池、未着衣物，回眸而立，湿发贴肩，水光未干。",
      characters: ["女王"],
      scenes: ["浴室"],
      props: ["浴巾"],
      framing: "女王半身至膝上，浴池边缘与蒸汽同框",
      viewpoint: "略低的三分之二侧面回眸视角",
      composition: "女王居中偏右，蒸汽虚化背景，远处石台上可见未用的浴巾",
      lighting: "暖琥珀壁灯光透过蒸汽，勾出真人轮廓与水光",
      mood: "妩媚、私密、奢华",
      expression: "红唇微启，眼神妩媚回眸",
    },
  ].map((panel) => ({
    ...panel,
    action: panel.description,
    image_prompt: `${panel.description}，photorealistic live-action still, real human woman, no clothing, fine-art figure study, cinematic 35mm, natural texture, no anime, no cartoon, no illustration, no 2D, 画面不要出现任何文字。`,
  })),
} as const;

export type RainyNightDemoDefinition = typeof RAINY_NIGHT_DEMO;
