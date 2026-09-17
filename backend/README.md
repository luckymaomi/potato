# tomato-ai-drama 后端

`tomato-ai-drama` 的独立 Node.js + Express + SQLite 服务端，源码、测试和构建均使用严格 TypeScript。默认监听 `5679`，API 前缀为 `/api/v1`。

运行环境要求 Node.js 20.9 或更高版本。

## 运行与验证

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

构建产物使用 `npm.cmd run start:dist` 启动。`build` 会先清空 `dist`，避免已删除模块残留在产物中。

当前快速开发流程不维护数据库迁移或旧 schema 兼容。应用启动时由 `src/db/schema.ts` 创建当前 schema；普通启动、测试和构建均保留 `data`。只有 owner 明确要求清空数据时，才由执行者停止服务后手工删除目录；后端不提供自动清库脚本。

## 模块边界

- `src/routes/`：HTTP 输入、输出和状态码，不实现生成规则。
- `src/services/`：项目、归档、实体、分镜、文本、图片、视频、任务和整集合成各自独立。
- `src/providers/`：统一能力合同、注册中心、运行时、传输和第三方错误。
- `src/providers/adapters/`：每个供应商独立处理自己的请求、响应和轮询协议。
- `src/db/`：SQLite 连接和当前唯一 schema。

业务服务只依赖 Provider 合同，不识别供应商协议。当前只注册：

- Agnes：文本、文生图、图生图、文生视频、图生视频。
- PearAPI：文本、文生图、图生图、文生视频、图生视频，实际能力以实时模型目录为准。

新增供应商时实现一个 `ProviderAdapter` 并在 `src/providers/index.ts` 注册；不得在文本、图片、视频服务中增加供应商条件分支。

每个实时模型快照都携带自己的生成模式、参考图上限和画幅比例。PearAPI 从凭据目录与公共丰富目录求交集；Agnes 的目录没有返回详细能力，因此由 Agnes 适配器复用真实请求协议声明。图片与视频服务在插入生成记录和创建异步任务前校验模式、参考图数量与比例；图片比例使用独立 `aspectRatio` 合同，不借用分辨率字段。

## 数据与接口

- 数据库：`data/tomato_ai_drama.db`
- 媒体目录：`data/storage`
- 健康检查：`GET /health`
- Provider 目录：`GET /api/v1/ai-configs/providers`
- 画布布局：`PUT /api/v1/dramas/:id/canvas-layout`，请求体必须包含 `canvas_layout` 与当前 `expected_revision`；成功后 `canvas_revision` 递增，旧版本返回 HTTP 409
- 任务状态：`GET /api/v1/tasks/:id`
- 任务取消：`POST /api/v1/tasks/:id/cancel`
- 文本默认提示词：`GET /api/v1/production/text-prompts`
- 整集合成：`POST /api/v1/episodes/:id/finalize`

六类文本系统提示词由 `src/services/textPromptCatalog.ts` 唯一维护。文本生成请求可用 `system_prompt` 覆盖默认值，角色/场景/道具提取和分镜拆分还可用 `source_text` 直接消费画布上游文本。取消任务会传播 `AbortSignal` 到文本、图片、视频和 FFmpeg；供应商若没有远端撤销协议，服务端只能中止本地请求、轮询、状态写回和后续编排。

API Key、供应商地址、运行设置和可选默认模型只读取仓库根目录私有 `config.yaml`；SQLite 只保存实时模型目录快照，不保存密钥。没有真实凭据时，确定性测试只证明请求合同和内部编排，不证明外部生成可用。
