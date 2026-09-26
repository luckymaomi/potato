export const RAINY_NIGHT_DEMO = {
  templateId: "queen-bath-demo",
  contract: "asset-output-pipeline-v12-asset-brief",
  project: {
    title: "《女王出浴》制作示例",
    description: "写实真人摄影风：女王浴后披巾回眸的一格资产与分镜示例。",
    story_hook: "女王浴后离开浴池，薄巾未束紧，在蒸汽中回眸。",
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
    "王室浴室暖雾未散。成年真人女性女王刚离浴池，象牙白薄浴巾松松绕胸一圈，上沿压在锁骨下方，下摆垂到大腿中段，肩背湿润，回眸一笑，完成这一镜。",
  episodePlan: {
    episode_goal: "完成女王出浴这一镜的写实真人资产标准图与分镜底板。",
    conflict: "蒸汽、水光与真人面部必须统一，禁止漂成动漫。",
    turning_point: "女王回眸，暖光勾出轮廓。",
    ending_hook: "出浴定格完成，可继续扩写。",
    scene_notes: "一格：女王出浴。",
  },
  script: `第一场：女王出浴
王室浴室蒸汽朦胧。成年真人女性女王刚离浴池，薄浴巾高束至胸上、下垂过膝上，湿发贴肩，红唇微启，妩媚回眸，完成写实电影感定格。`,
  characters: [
    {
      name: "女王",
      output_prompt:
        "photorealistic live-action photograph of an adult real human woman queen just after a warm bath, ivory towel loosely wrapped under the collarbones covering the chest and hips, hem falling to mid-thigh, damp shoulders and water sheen, not anime, not cartoon, not illustration, not 2D. Black damp long hair, red lips, quiet seductive gaze over the shoulder, warm steamy royal bathroom, cinematic 35mm film look, natural texture, realistic lighting, elegant intimate portrait, no text, no watermark.",
      text_profile: {
        brief:
          "成年女性；精致鹅蛋脸，下颌柔和，红唇微启，眉眼妩媚，睫毛带水汽；黑色长发浴后微湿贴肩；高挑匀称沙漏型体态，暖白肤色带蒸汽晕红与水光；写实真人五官与发丝，禁止二次元；象牙白薄浴巾松绕：上沿压在锁骨下方盖住胸部，下摆垂到大腿中段，肩颈与上背外露，一侧肩头巾角欲滑未滑；不戴王冠，赤足；回眸浅笑、微微眯眼、红唇轻启，妩媚自信",
      },
    },
  ],
  scenes: [
    {
      location: "浴室",
      output_prompt:
        "photorealistic live-action royal private bathroom panorama, marble bath pool, warm steam, golden wall sconces, wet floor reflections, empty room, cinematic lighting, real materials, no anime, no illustration, no text.",
      text_profile: {
        brief:
          "王室私人浴室；中央大理石浴池，古典王室浴殿石柱与金线嵌边，台阶、石制盥洗台、毛巾架，私密中型空间；室内金色壁灯与柔光，蒸汽散射体积光，暖琥珀色温；私密安静奢华，象牙白、暖金、雾灰与水光，室内高湿蒸汽，写实材质",
      },
    },
  ],
  props: [
    {
      name: "备用巾",
      output_prompt:
        "photorealistic folded ivory bath towel still life on marble bench, thick soft cotton, unused, neat folds, real fabric texture, no anime, no text.",
      text_profile: {
        brief:
          "浴室织物；成人用大浴巾；厚实棉质真实织纹；象牙白近纯白；长方形折叠整齐；干净干燥备用，一角细小金色纹章，宽幅褶皱自然；叠放在石台上作背景陈设，人物身上另有裹巾；写实布料",
      },
    },
  ],
  panels: [
    {
      title: "分镜1｜女王出浴",
      description:
        "写实真人摄影：王室浴室蒸汽中，成年女性女王刚离浴池，象牙白薄巾松绕胸下至大腿中段，回眸而立，湿发贴肩，水光未干。半身至膝上，浴池边缘与蒸汽同框；略低三分之二侧面回眸；女王居中偏右，蒸汽虚化背景，远处石台可见叠好的备用巾；红唇微启、眼神妩媚回眸；暖琥珀壁灯透过蒸汽勾轮廓与水光；妩媚、私密、奢华。",
      characters: ["女王"],
      scenes: ["浴室"],
      props: ["备用巾"],
    },
  ].map((panel) => ({
    ...panel,
    action: panel.description,
    image_prompt: `${panel.description}，photorealistic live-action still, real human woman, draped ivory towel from collarbone to mid-thigh, cinematic 35mm, natural texture, no anime, no cartoon, no illustration, no 2D, 画面不要出现任何文字。`,
  })),
} as const;

export type RainyNightDemoDefinition = typeof RAINY_NIGHT_DEMO;
