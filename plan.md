# 当前任务：按工作流差距报告重建资产产出层

## 需求与边界

以 owner 指定的 `WORKFLOW_GAP_REPORT.md` 为调查证据，以 `C:\Users\Administrator\Desktop\AI短剧工作流.md` 为产品主干，完成单卡单 ID 语义、标准资产图产出层、事实文档、完整验证和本地简体中文提交。

- 不调用 Agnes、PearAPI 或其他真实供应商，不做付费验收。
- 不 push、不部署、不发布。
- 新 schema 从空库建立，不保留旧字段或旧 ZIP 格式兼容层。
- 不清理当前 `backend/data`；旧本地数据库需在 owner 明确操作时重建。
- 保留 owner 工作区中内容差异为空的 `frontend/src/features/generation/*` 状态；只读报告 `WORKFLOW_GAP_REPORT.md` 不纳入提交。

## 修改前证据

- 角色卡允许在一个 ID 下保存多个换装项，道具卡允许在一个 ID 下保存多个状态项，与单卡单设定冲突。
- 资产标准图生成只追加按类型区分的一句泛化约束，没有持久化产出方式，也没有角色 A-D、场景三类和道具两类的稳定编译合同。
- 外部工作流原文对资产是否独立、图片配方是否包含对白存在自相矛盾。
- 后端 README 残留已不存在的全局资产、文本生成和通用生产入口描述。
- 失败证据：新增产出类型持久化与提示词合同后，定向测试在旧实现上因缺少产出层组装器和产出规格字段而失败。
- 理念收口复核发现：产品路由已无 AI 文本创作入口，但 AI 配置页、模型预设、Provider 合同和两家适配器仍暴露独立文本生成能力。改为图片/视频正向契约后，Agnes 目录和前端预设测试在旧实现上失败。

## 目标主干

### 单卡单 ID

- 角色卡只用 `default_outfit` 描述本卡唯一造型；不同造型分别建立角色卡。
- 场景的不同时间或光影设定分别建立场景卡。
- 道具卡的文本只描述本卡状态和互动；不同状态分别建立道具卡。
- generation 历史只用于选定当前标准图，不是资产造型或状态树。

### 产出规格

`project_assets.output_type` 是资产标准图产出方式的唯一持久化事实，按资产类型严格校验：

```text
character
├── character-layout-a  三栏三视图（默认）
├── character-layout-b  左脸右身
├── character-layout-c  4+3 双层
└── character-layout-d  7 图锚点组

scene
├── scene-panorama          空间全景图（默认）
├── scene-detail            局部特写图
└── scene-lighting-variant  光影变体卡（独立 ID）

prop
├── prop-multi-angle   多角度图（默认）
└── prop-state-variant 状态变体卡（独立 ID）
```

- schema 使用非空列和数据库 CHECK；创建卡时后端按 kind 选默认值，更新时校验归属。
- 项目 ZIP 断裂升级到 `format: 5`，往返保存产出规格。

### 产出提示词 owner 和通道

- `backend/src/services/assetOutputPromptAssembler.ts` 读取已持久化资产卡，编译资产文本、当前布局/产出约束和类型公共约束。
- 角色四种布局各有可执行的布局描述，共同明确脸、发型、服装、身高比例、五官和背景一致性。
- 资产生成请求只提交供应商、模型和画幅参数；后端组装提示词，并把 `input_reference_images` 作为独立图片参数。
- 标准资产图写入 `image_url`；分镜只引用该标准图，不传播用户上传的资产生成输入图。
- 图片配方包含静态字段；声音和对白只进视频配方。
- 独立文本生成不属于产品能力；AI 配置、模型目录、预设和 Provider 适配器只保留图片与视频合同。

## 完整影响面

- 后端：schema、领域类型、资产 repository、资产产出组装器、生成路由、分镜资产文本、项目 ZIP、Demo 初始化、Provider 合同与媒体模型目录。
- 前端：资产领域类型、资产卡表单、产出方式选择、当前标准图语义和只含图片/视频的 AI 配置。
- 测试：repository、产出组装器、生成消费、双配方、项目归档和 Demo 默认规格。
- 文档：外部工作流、`spec.md`、根 `README.md`、`backend/README.md`、`history.md`。

## 实施状态

- [x] 读取规约、当前 spec、工作流主干、差距报告和命中的 Skill。
- [x] 核验修改前证据及资产生成、归档、Demo、UI 影响面。
- [x] 建立产出类型持久化和各产出提示词的正向契约。
- [x] 断裂更新 schema、领域类型、repository、项目读取和 ZIP 格式。
- [x] 删除单卡多造型/多状态的 repository、assembler、UI 和测试数据。
- [x] 新增资产产出提示词 owner，资产生图入口改为消费后端持久规格。
- [x] 更新资产页产出类型选择、generation 选用语义和 Demo 默认规格。
- [x] 删除 AI 配置、模型预设、Provider 合同和适配器的独立文本生成链路。
- [x] 修订外部工作流中的资产独立性、项目级边界和图片对白矛盾。
- [x] 同步 `spec.md`、根 `README.md`、`backend/README.md`、`history.md`。
- [x] 运行定向测试与前后端独立 typecheck。
- [x] 运行前后端完整 test、lint、typecheck、build。
- [x] 运行静态残留、敏感信息、未跟踪文件和 `git diff --check` 检查。
- [x] 回填完成事实、未验证项和风险；本地简体中文提交随本次收口创建，不 push。

## 验证计划

- 后端：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`oxlint src test scripts`。
- 前端：`npm.cmd test`、`npm.cmd run lint`、独立 `tsc -b --pretty false`、`npm.cmd run build`。
- 静态检查：旧多造型/多状态字段、全局资产实现、旧 ZIP 格式、旧泛化组装函数、前端最终提示词拼接。
- 差异检查：`git diff --check`、敏感信息扫描、未跟踪文件和暂存范围复核。

## 收口

- 完成事实：单卡单 ID、资产产出规格、后端唯一组装器、图片/视频双配方消费、参考图边界、媒体专用 Provider 合同、ZIP 5 和事实文档已收敛。
- 实际验证：后端 `npm.cmd test` 62/62、typecheck、build、oxlint 通过；前端 `npm.cmd test` 21/21、lint、独立 typecheck、build 通过；`git diff --check` 通过。静态检查旧资产字段、独立文本生成链、全局资产实现和前端配方组装均为 0；目标端口监听为 0。
- 未验证项：真实供应商对布局约束的遵循度、浏览器人工视觉验收、当前本地数据库重建。
- 剩余风险：当前 `backend/data/tomato_ai_drama.db` 只读检查仍是旧 schema，没有 `output_type` 且仍允许文本模型类型；按交付规约未擅自清理，新主干启动前必须重建。前端仍有 5 条既有 effect lint warning，Vite 仍报单包体超过 500 kB。
- commit/push：本地简体中文提交随本文件一起创建；push 未执行。
