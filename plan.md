# 当前任务

## 需求

把分镜台落实为短剧生产链的“镜头规格编译器”，并同步把 Demo 简化为悬疑短剧《雾港来信》5 个镜头。故事、剧本和镜头清单由用户人工编辑；AI 只保留三类媒体用途：资产图（文生图/图生图）、分镜图（由 assembler 组装后生图）和镜头视频（由分镜图与 assembler 组装后生视频）。删除其它文本 AI 功能。生成提示词必须由后端唯一事实源组装，前端不能再另算一套最终生成提示词。

## 当前事实

- 产品主链是：故事/剧本 → 资产图 → 分镜台 → 分镜图 → 镜头视频 → 整集合成。
- `backend/src/routes/workspaceRoutes.ts` 的分镜图片入口目前主要使用 `body.prompt` 或 `image_prompt/description/title`；视频入口主要使用 `body.prompt` 或 `video_prompt/description`。
- 分镜字段已能持久化：景别、机位、运镜、构图、动作、对白、光线、氛围、声音、图像提示词、视频提示词、资产托盘。
- 当前字段大多没有进入图片/视频的最终 prompt；资产主要作为参考图 URL，资产名称/描述未形成稳定文本块。
- `split-storyboards` 默认系统提示词只要求少量字段，没有要求完整镜头语言字段。
- 九宫格独立 UI 已移除，但 `grid_rows/grid_columns` 仍存在于 schema/domain/repository，是历史兼容残留。
- `reference/moyin-creator` 的主要可取点是按 Camera/Lighting/Subject/Mood/Setting&Audio/Style 分层、逐镜优先和空字段跳过；它自身仍有图片/视频/九宫格多路径重复组装，不能照搬为唯一 owner。
- `kitty` 的主要可取点是结构化 `label/value` 块、过滤空值、稳定层级、文本 prompt 与图片引用分离、Provider 按真实合同接收字段。
- 当前工作区已有 owner 修改，不能回滚无关差异；本任务只触碰分镜生成、拆镜合同、Demo、对应测试和文档。
- 文本 AI 命令当前仍存在于后端生产命令、提示词目录和前端剧本/分镜操作中；本任务将移除这些用户入口与执行分支，保留人工剧本保存、资产媒体生成（文生图/图生图）、分镜图和镜头视频生成。

## 失败测试或失败证据

- 只填写镜头语言而不填写 `image_prompt/video_prompt` 时，当前提交给图片/视频服务的 prompt 不包含这些字段。
- 当前 `imagePrompt()` 只有 `image_prompt → description → title` 回退。
- 当前图片入口没有把 `negative_prompt` 传到图片服务。
- 当前拆镜系统提示词没有要求 `shot_size/camera_angle/camera_movement/composition/lighting/mood/sound`。

## 目标

1. 新增后端唯一 assembler：输入分镜规格和所选资产，输出静态图片 prompt、视频 prompt、文本资产块、参考图数组以及按 Provider 能力决定的可选字段。
2. 图片入口、视频入口和等价生产入口统一消费 assembler；body 中的主体 prompt 只能作为主体覆盖，不能绕过镜头语言/资产组装。
3. 字段按稳定语义顺序组装；空值跳过；图片偏静态构图，视频偏运动/镜头/声音，但用户填写的相关字段必须按用途进入对应 prompt。
4. 图片 negative prompt 透传到真实支持的 ImageProviderRequest；视频不伪造通用 negative 能力，当前合同不展示/不传。
5. 删除 AI 生成剧本、AI 拆镜和其它文本生成入口；人工剧本与人工分镜 CRUD 保持可用。
6. 回归测试覆盖：只填镜头语言、全空镜头语言、资产文本+参考图、负面提示词图片透传、视频不假传、前端 body prompt 不能绕过组装。
7. Demo 改为《雾港来信》、悬疑风格、5 个镜头，并同步 spec/README/history/初始化测试。

## 不做范围

- 不删除分镜台镜头语言 UI，不强制任何字段必填。
- 不保留 AI 生成剧本、AI 拆镜等文本创作按钮、路由和执行分支；人工输入是唯一文本创作方式。AI 只用于资产图、分镜图和镜头视频媒体生成。
- 不调用真实付费供应商，不进行真实 Demo 外部验收。
- 不把九宫格恢复为独立业务 UI；九宫格只作为图像 prompt 文字块或用户主体提示词的一部分。
- 不扩展成全量数据库迁移、不恢复旧供应商、不重做无关画布/资产/样式模块；删除文本 AI 入口只做必要的调用链收口，不清理无关历史数据表。
- 不把声音硬塞入静态图片请求；声音只进入视频文本 prompt，Provider 是否实际生成音频仍以其真实合同为准。

## 设计

### 唯一 owner

`backend/src/services/storyboardPromptAssembler.ts` 拥有“分镜规格 → 生成输入”的编译规则。路由、生产编排器和前端只传规格/生成参数，不复制字段拼接。

### 编译结果

```ts
{
  imagePrompt: string,
  videoPrompt: string,
  imageReferences: string[],
  videoReferences: string[],
  imageNegativePrompt?: string
}
```

### 稳定顺序

- 图片：主体图像提示词 → 资产文本 → 静态画面（剧情/景别/机位/构图/动作/对白/光线/氛围）→ 九宫格等构图文字。
- 视频：主体视频提示词（无则回退主体描述）→ 分镜图/资产引用语义 → 运动镜头（景别/机位/运镜/构图/动作/光线/氛围/声音/对白）→ 用户补充。
- 仅有值的字段进入；不生成空标签或空块。
- 资产图片作为独立 references；资产文本使用名称、描述、appearance/prompt 中最具体的非空值。

### Provider 边界

- `ImageProviderRequest.negativePrompt` 是图片真实合同，工作台分镜图片传入 `negative_prompt`。
- 当前 `VideoProviderRequest` 没有 negativePrompt；视频 assembler 保留字段但不传，避免伪造能力。

## 实施任务

- [x] 调查：完成当前项目、`moyin-creator`、`ai-short-drama`、`kitty` 对比并记录证据。
- [x] 写正向契约测试：assembler、Provider 图片负面提示词、Demo 五镜头。
- [x] 实现 assembler 与资产文本/参考图编译。
- [x] 接通图片、视频及等价工作台入口，接通图片负面提示词。
- [x] 移除剧本页/分镜台文本 AI 用户入口和工作区路由；生产 HTTP 入口明确拒绝文本 AI，保留人工编辑。
- [x] 将 Demo 改为《雾港来信》5 镜头悬疑版本，主角为女性调查记者。
- [x] 同步 `spec.md`、`README.md`、`history.md`。
- [x] 运行后端定向/全量测试、typecheck、build；运行前端测试、lint、build。
- [x] 检查 diff、敏感信息、生成物、`git diff --check`，按授权提交并尝试 push。

## 验证计划

- 单元测试：assembler 的字段顺序、空字段、资产语义、参考图、negative prompt。
- 路由/服务测试：分镜图片和视频提交的最终 prompt 来自 assembler；body 主体覆盖仍保留镜头规格。
- Provider 合同测试：图片请求含 `negative_prompt`；视频请求不出现该字段。
- Demo 测试：初始化项目标题、类型、5 个有序分镜、悬疑内容和幂等合同。
- 自动验证：后端 `npm test`、`npm run typecheck`、`npm run build`；前端 `npm test`、`npm run lint`、`npm run build`。
- 未调用真实供应商；不把 HTTP 200、Mock 或历史成功当作本轮真实媒体验收。

## 收口

- 完成事实：assembler、生成入口、Demo、文档和正向回归已完成；文本 AI 工作区入口已移除，生产 HTTP 入口明确拒绝；commit 与 push 已完成。
- 实际命令：`backend npm.cmd test`、`backend npm.cmd run typecheck`、`backend npm.cmd run build`、`frontend npm.cmd test`、`frontend npm.cmd run lint`、`frontend npm.cmd run build`、`git diff --check`、`git push origin master` 已通过。
- 未验证项：真实供应商、浏览器人工视觉、外部付费生成。
- 剩余风险：视频模型是否实际合成声音取决于供应商合同；旧 grid 字段仍可能需要后续断裂式清理；参考图 URL 的供应商可达性需外部验收。
- commit/push：`89d357c` 已提交并成功推送到 `origin/master`；未执行部署或关机。
