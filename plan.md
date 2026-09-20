# 当前任务：按《AI 短剧工作流》断裂式重建产品主干

## 需求

以 owner 提供的 `C:\Users\Administrator\Desktop\AI短剧工作流.md` 为当前产品主干，完成 reference 调研、当前差距核验、数据库和业务链路断裂式重建、事实文档同步、完整自动验证与本地简体中文提交。

交付边界：

- 不调用真实图片、视频或文本供应商，不做付费验收。
- 完成后可以创建一个本地提交；不 push、不部署、不发布。
- owner 已删除本地数据库；2026-09-20 已核验 `backend/data` 不存在。
- 不迁移旧数据库，不保留旧 schema、旧接口、旧路由或旧字段兼容层。
- 保留 owner 当前未提交的 `frontend/src/features/generation/*` 改动，并在其基础上工作。

## 已确认的 reference 结论

### `reference/moyin-creator`

可借鉴：

- 视频提示词按 Camera、Lighting、Subject、Mood、Setting & Audio、Style 分层，字段按稳定顺序输出。
- 逐镜字段优先、项目级默认值回退，以及空值不输出标签的做法，适合分镜规格编译器。
- 角色/场景带 `projectId`，项目数据可拆分存储，证明资产按项目隔离是可实施的。

不适用：

- 同时存在共享数据和项目数据，`shareCharacters/shareScenes/shareMedia` 可以重新合并跨项目资产，不符合本项目“项目之间完全隔离”。
- `prompt-compiler.ts`、storyboard prompt builder、generation prompt builder 等多处各自组装，不能作为唯一 owner 的实现范本。
- 宫格故事板、多套自动拆镜与 AI 文本工作流不属于当前产品主干。

### `reference/ai-short-drama`

可借鉴：

- 项目资产通过项目 ID 查询并校验项目所有权；角色、场景、道具分别保持自己的领域结构。
- `asset-prompt-context` 将资产文本整理为稳定上下文，图片生成再把 `referenceImages` 作为独立参数传给生成器，文本和图片边界清楚。
- generation 输入、候选结果、当前选中版本和媒体对象分开，适合本项目保留“标准资产图 + 历史版本”合同。

不适用：

- 它有完整的全局资产中心、文件夹、全局角色/场景/音色以及“复制到项目”链路；这是本次必须删除的反例，不应照搬。
- 资产引用主要按名称/别名匹配，当前项目要求分镜按本项目资产 ID 引用。
- 分镜图片 worker 自己构建 prompt 上下文，视频阶段又有独立 prompt 状态，不能满足“分镜台一次编译两份配方”。

### `C:\Users\Administrator\Desktop\repository\kitty`

可借鉴：

- `buildFieldBlock` 对 `{ label, value }` 先清洗、过滤空值，再输出稳定字段块；`joinBlocks` 只连接非空块，正好对应“有值组装、空值跳过、不生成空标签”。
- 媒体生成入口把 `prompt` 与 `images`/`image` 分开，Provider 适配器只接受真实协议字段并校验参考图数量和格式。
- 生成成功后下载、检查真实媒体并原子写入的边界，与本项目现有媒体归档原则一致。

不适用：

- Kitty 是通用代理运行时，不包含短剧项目、剧集、资产卡或分镜台领域层级；只借鉴结构化组装和 Provider 边界。

### `reference/comfyui-frontend`

可借鉴：

- 资产使用稳定 ID，选择状态只保存 ID；输入资产和输出资产有明确上下文，输出还能关联产生它的 job/node。
- 资产 schema、展示模型和选择状态分层，适合“卡片身份、生成输入、标准产出、generation 历史”分开管理。
- 节点/工作流模板保存显式序列化数据，不靠运行时隐式搜索资产。

不适用：

- ComfyUI 是通用节点图和全局资产浏览器，没有短剧项目隔离、三类资产卡语义或分镜配方规则。
- 本项目已采用领域工作台，不恢复自由节点图、模板库或通用资产中心。

### `n8n`

- `reference/` 和 `C:\Users\Administrator\Desktop\repository\n8n` 均不存在，当前没有本地源码证据可调研。
- 本次不使用记忆或网络印象补写 n8n 结论；这项作为未取得证据记录，不阻塞以现有四个 reference 完成设计。

## 当前实现事实与差距

### 容器与资产

- 当前 schema 同时存在 `asset_library_items`、`project_assets`、`characters`、`scenes`、`props` 五套资产形态，不是唯一项目资产主干。
- `project_assets.library_item_id`、创建接口的 `from_library_item_id`、全局库路由 `/asset-library`、前端 `/film/:id/assets/library` 和 `AssetLibraryWorkspace` 仍实现跨项目全局资产库。
- `README.md`、`spec.md` 和项目 ZIP 都仍声明全局资产快照。
- 项目资产当前只有通用 `description/appearance/prompt/visual_description/metadata`，没有文档定义的三类结构化文本卡。
- 用户上传的资产生成参考图只停留在前端当前会话和某次 generation 输入；资产卡没有持久化自己的“输入参考图”。
- 旧 `characters/scenes/props` 仍有独立 CRUD、分镜关联表和 generation 外键，是与 `project_assets` 重复的第二套领域模型。

### 分镜编译与生成消费

- 后端已有 `storyboardPromptAssembler.ts`，已能按字段组装图片/视频 prompt，并把图片参考图保持为数组；这是可保留并重建的唯一 owner 位置。
- 当前图片配方引用项目资产标准图，方向正确。
- 当前 `videoReferences` 只装分镜图；项目资产标准图没有进入视频配方。视频路由又把同一张分镜图同时作为 `firstFrame` 和 `referenceImages`，混淆“首帧”和“辅助参考图”。
- 图片和视频入口仍接受 `body.prompt` 覆盖，前端/任意调用方可以绕过后端规格 owner。
- 通用 `/production/execute` 仍允许调用方直接提交任意图片/视频 prompt 和 reference_images，形成第二条生成主干。
- 分镜 schema 仍保留 `negative_prompt`、`grid_rows/grid_columns`、`duration` 旧字段；当前主干文档没有这些分镜规格。
- 分镜目前没有持久化“本镜额外参考图”，因此无法完整实现文档中的图片通道。

### 文本 AI

- 前端剧本/分镜页面已经没有 AI 生成按钮，这是已完成事实。
- 后端仍保留 `TextGenerationService`、`textPromptCatalog`、`ai-text` production command、`split-storyboards` 等执行代码和测试；production 路由只是在运行时拒绝，旧入口并未断裂式删除。
- AI 配置和 Provider 基础设施仍有 text 模型能力；是否保留通用 Provider 描述必须与“产品没有文本 AI 入口”区分。本次删除产品执行入口，不改供应商目录协议中客观存在的 text 能力字段。

### 测试

- 当前 feature 测试同时覆盖全局资产复制、旧 `characters/scenes/props`、文本命令和旧归档格式，必须随主干替换。
- 仓库存在 `assert.rejects/assert.throws` 等明确拒绝合同；按 `AGENTS.md`，错误可见与明确拒绝属于正向契约，不等于“用测试证明旧字符串不存在”。
- 本次新增长期测试只断言用户可观察的有效结果：项目隔离、三类卡保存、配方内容/顺序、参考图来源、生成请求消费结果、归档往返。删除残留通过源码静态扫描和 diff 审查证明，不新增“没有某字符串/只有某数量”的反向测试。

## 目标主干

### 数据层级

```text
dramas（项目）
├── project_assets（项目级角色卡 / 场景卡 / 道具卡）
│   ├── kind + name
│   ├── text_profile（按 kind 校验的结构化文本）
│   ├── input_reference_images（生成标准资产图的输入）
│   ├── current_image_generation_id + 当前标准资产图
│   └── image_generations（每次生成/上传的历史）
└── episodes（剧集）
    ├── script_content
    ├── storyboards（人工镜头规格 + 本项目资产 ID + 本镜额外参考图）
    ├── image_generations / video_generations
    └── 本集合成
```

- `project_assets` 是唯一资产表；`drama_id` 是强制项目边界。
- `kind` 只接受 `character | scene | prop`，分别显示为角色卡、场景卡、道具卡。
- 角色卡、场景卡、道具卡使用按 kind 校验的 `text_profile` JSON；后端负责规范化并编译成人类可读文本块。
- `input_reference_images` 只供该资产生成标准资产图，不会被分镜台继续向下游传播。
- 分镜台只引用 `project_asset_ids`；后端验证每个 ID 都属于当前项目。
- 分镜的 `extra_reference_images` 是本镜用户额外上传的输入；与资产卡生成输入是两个不同概念。

### 三类卡文本结构

- 角色卡：身份、年龄、性别、职业、阵营、身份标签；脸型、五官、发型、体型、肤色；默认穿搭、换装版本；性格、常见表情、气场；音色 ID、语速、口音、标志性语气。
- 场景卡：地点类型、布局、建筑风格、尺寸比例；时间段、光源、色温、明暗对比；关键家具、道具、装饰、植被；色调、情绪、天气。
- 道具卡：名称、类别、尺寸、材质、颜色、形状；新旧程度、特殊标记、独特设计；默认状态、互动状态、绑定关系。
- 所有字段可空；保存时清理空字符串，编译时只输出有值字段。

### 分镜台唯一编译器

`backend/src/services/storyboardPromptAssembler.ts` 重建为唯一 owner：一次读取已持久化的镜头规格和已验证的本项目资产卡，输出两份互不借用结果的配方：

```ts
{
  imageRecipe: {
    imagePrompt: string,
    imageReferences: string[],
  },
  videoRecipe: {
    videoPrompt: string,
    videoReferences: string[],
  },
}
```

图片文本顺序：

1. `image_prompt` 主干；为空时回退 `description/title`。
2. 角色卡、场景卡、道具卡的结构化文本块。
3. 景别、机位、构图、动作、光线、氛围等静态镜头字段。

视频文本顺序：

1. `video_prompt` 主干；为空时回退 `description/title`。
2. 同一批资产卡的结构化文本块。
3. 景别、机位、运镜、构图、动作、光线、氛围、声音、对白等动态镜头字段。

图片通道：

- `imageReferences` = 本镜引用资产卡的当前标准资产图 + 本镜 `extra_reference_images`。
- 不使用资产卡的 `input_reference_images`，不把 URL 拼进 prompt。

视频通道：

- `videoReferences` = 本镜引用资产卡的当前标准资产图 + 本镜 `extra_reference_images`。
- 分镜图不放进 `videoReferences`；它作为独立 `firstFrame` 传给视频生成服务。
- Provider 是否能接收辅助多图由真实模型能力校验；不能支持时明确拒绝，不静默伪造或错误复用首帧。

文档内部对“对白是否进入图片提示词”有一处冲突：3.2 图片顺序列出对白，但 3.1 字段用途表和 4.2 规则均写对白仅视频。本计划采用证据更一致的“对白与声音只进入视频配方”。

### 消费边界

- 分镜图片路由只接收生成参数（模型、图片画幅），从后端图片配方取得 `prompt/references`。
- 分镜视频路由只接收生成参数（模型、时长、视频画幅），从后端视频配方取得 `prompt/references`，并另外取得已完成且当前选中的分镜图作为 `firstFrame`。
- 前端不再为分镜图片/视频提交 `prompt` 或 `reference_images`。
- 删除通用 production 命令绕过路径；工作区领域接口是图片、视频与合成的唯一产品入口。
- 资产标准图生成由后端按资产 `text_profile` 编译 prompt，并读取该卡 `input_reference_images`；前端只保存卡规格和选择生成参数。

## 数据库断裂式变更

直接重写空库 schema，删除：

- `asset_library_items`。
- `project_assets.library_item_id`。
- `image_generations.library_item_id`。
- `characters`、`scenes`、`props`。
- `storyboard_characters`、`storyboard_scenes`、`storyboard_props`。
- `image_generations.character_id/scene_id/prop_id`。
- `storyboards.negative_prompt/grid_rows/grid_columns/duration`。
- 所有对应索引、类型、repository 方法、路由、archive 映射和测试夹具。

重建/新增：

- `project_assets.text_profile TEXT NOT NULL DEFAULT '{}'`。
- `project_assets.input_reference_images TEXT NOT NULL DEFAULT '[]'`。
- `storyboards.extra_reference_images TEXT NOT NULL DEFAULT '[]'`。
- `storyboard_project_assets` 继续作为唯一分镜资产关联表。
- 项目 ZIP 升级为新的不兼容格式，只归档项目资产、分镜、generation 和本地媒体；不解析旧格式。

因为 `backend/data` 已不存在，本任务不执行迁移 SQL、不恢复旧 ID、不为历史 ZIP 写兼容解析器。

## 完整影响面

### 后端

- schema、domain types、AssetRepository、ProjectService。
- workspace 路由、路由注册、旧 entity/storyboard/production 路由。
- storyboard assembler、图片/视频 generation 输入和目标指针。
- ProjectArchiveService、Demo 初始化定义和初始化测试。
- TextGenerationService、textPromptCatalog、production commands/workflow/container 的删除或收口。
- 相关测试：asset repository、assembler、core services、archive、Demo、production command。

### 前端

- 移除 `AssetLibraryWorkspace`、全局库路由/API/type 和所有“从全局库加入”入口。
- AssetWorkspace 改为三类项目卡：kind 对应结构化字段、资产生成输入参考图、标准资产图与 generation 历史。
- StoryboardWorkspace 增加本镜额外参考图持久化；只保存规格与资产 ID，生成时不传最终 prompt/references。
- ProduceWorkspace 只提交模型能力参数，不组装或覆盖视频 prompt/references。
- 删除旧生产命令/文本 AI 前端类型与未使用 API。
- 保持 owner 已修改的 generation 计时/终态投影行为。

### 文档

- `spec.md`：只写重建并验证后的当前事实和验收合同。
- `README.md`：只保留用户入口、项目级三类卡、双配方与运行命令。
- `history.md`：追加本次 reference 取舍、差距证据、断裂式决定、验证层级和外部未验收项；历史记录本身不倒改。

## 实施任务

- [x] 读取仓库规约、主干文档和命中的业务 Skill。
- [x] 调研 `moyin-creator`、`ai-short-drama`、Kitty、ComfyUI；确认本地没有 n8n 源码。
- [x] 核验当前全局资产、重复资产表、assembler、文本 AI、前端路由、归档和测试差距。
- [x] 确认 `backend/data` 已删除，可以断裂式重建而不做迁移。
- [x] 写正向领域契约测试：三类项目卡、项目隔离、结构化文本规范化、输入参考图持久化。
- [x] 写正向编译契约测试：两份独立配方、稳定顺序、空值跳过、文本/图片分离、首帧独立。
- [x] 重建数据库 schema、领域类型、repository 和项目读取链路。
- [x] 重建资产标准图输入链路和分镜双配方 assembler。
- [x] 让图片/视频入口只消费后端配方，并删除通用绕过入口和文本 AI 执行主干。
- [x] 更新项目 ZIP、Demo 与媒体 generation 目标结构。
- [x] 更新前端三类资产卡、分镜额外参考图与生成请求。
- [x] 删除全局资产 UI/API/type、旧资产模型和不再使用的文件。
- [x] 同步 `spec.md`、`README.md`、`history.md`。
- [x] 运行定向测试并修复回归。
- [x] 运行后端 test/typecheck/build 和前端 test/lint/build。
- [x] 运行静态残留扫描、`git diff --check`、敏感信息与未跟踪文件检查。
- [x] 回填本计划收口事实并创建本地简体中文提交；不 push。

## 验证计划

### 确定性自动验证

- 后端：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`。
- 前端：`npm.cmd test`、`npm.cmd run lint`、`npm.cmd run build`。
- 定向测试至少覆盖：
  - 同一项目多集引用同一项目资产卡 ID。
  - 不同项目的分镜保存时只能得到本项目资产 ID。
  - 三类卡结构化字段往返和资产生成输入参考图往返。
  - 图片/视频配方的稳定文本顺序、标准资产图与额外参考图数组。
  - 视频生成的首帧和辅助参考图是两个参数。
  - 项目 ZIP 往返后资产、配方输入、generation 指针和本地媒体仍对应。

### 静态残留扫描

源码和当前事实文档中检查：

- `asset_library_items`、`library_item_id`、`AssetLibraryWorkspace`、`/asset-library`、`assets/library`。
- 旧 `characters/scenes/props` 资产 CRUD 和三张旧分镜关系表。
- `TextGenerationService`、`textPromptCatalog`、`ai-text`、`split-storyboards` 产品执行入口。
- 前端向分镜图片/视频生成提交 `prompt` 或 `reference_images`。
- 视频入口自行拼接字段，或把分镜图重复放入 `referenceImages`。

历史文档中的旧事实作为时间记录可以保留；扫描结果需区分 `history.md` 历史文本与当前代码/事实 owner。

### 不执行的验证

- 不调用 Agnes、PearAPI 或其他真实供应商。
- 不运行会提交真实媒体任务的 Demo。
- 浏览器人工交互与最终视觉验收不是自动测试的替代品；实现完成后如能启动本地服务，只做不触发供应商的页面检查并单独报告。

## 收口

- 完成事实：
  - 数据库已按空库断裂式重建；`project_assets` 是唯一资产表，只接受角色、场景和道具三类卡，没有迁移或兼容层。
  - 资产卡、分镜、图片/视频 generation、项目 ZIP 和《红女王》Demo 已切换到当前结构。
  - 后端分镜编译器一次返回独立的图片配方与视频配方；图片/视频工作区入口分别消费对应配方，视频另取已选分镜图作为首帧。
  - 前端只保存资产卡、镜头规格、引用 ID、额外参考图和模型参数，不提交最终 prompt 或 reference 数组。
  - 全局资产库、旧资产表/关系表、通用 production 命令、产品文本 AI 服务与前端入口已删除。
  - `spec.md`、`README.md` 和 `history.md` 已同步当前事实。
- 实际验证：
  - 后端 `npm.cmd test`：61/61 通过。
  - 后端 `npm.cmd run typecheck`：通过。
  - 后端 `npm.cmd run build`：通过。
  - 后端 `..\frontend\node_modules\.bin\oxlint.cmd src test scripts`：通过，无错误。
  - 前端 `npm.cmd test`：21/21 通过。
  - 前端 `npm.cmd run lint`：退出码 0，有 5 条 `react(set-state-in-effect)` warning。
  - 前端 `.\node_modules\.bin\tsc.cmd -b --pretty false`：通过。
  - 前端 `npm.cmd run build`：通过，有 Vite 大包体 warning。
  - 本地烟测：`GET /health` 返回 `ok`；项目列表返回《红女王》与第 1 集；资产接口返回 9 张三类资产卡；分镜接口返回 5 个带项目资产关系及 `extra_reference_images` 字段的镜头；前端深链与 `/api` 代理均返回 200。
  - 静态扫描未发现全局资产实现、旧资产关系表、文本 AI 产品入口、前端分镜 prompt/reference 提交或第二个媒体任务创建入口。Provider 适配器中的 `negative_prompt` 是供应商协议字段。
  - `git diff --check`、未跟踪文件检查和新增差异敏感信息扫描通过；仅有 Git 的 LF/CRLF 提示。
- 未验证项：真实供应商媒体生成、真实模型多参考图能力、浏览器人工交互与最终视觉验收。
- 剩余风险：前端保留 5 条 effect lint warning；生产包主 JS 约 1.28 MB，Vite 提示超过 500 kB；真实供应商对首帧加辅助多参考图的支持仍需在明确授权后验证。
- commit/push：本地提交使用简体中文信息 `按短剧工作流重建项目资产与双配方主干`；未 push、未部署、未发布。
