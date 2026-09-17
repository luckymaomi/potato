# mini-video 后端

`mini-video` 的独立 Node.js + Express + SQLite 服务端，源码、测试和构建均使用严格 TypeScript。默认监听 `5679`，API 前缀为 `/api/v1`。

## 运行与验证

```powershell
npm.cmd install
npm.cmd run migrate
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

构建产物使用 `npm.cmd run start:dist` 启动。`build` 会先清空 `dist`，避免已删除模块残留在产物中。

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

## 数据与接口

- 数据库：`data/mini_video.db`
- 媒体目录：`data/storage`
- 健康检查：`GET /health`
- Provider 目录：`GET /api/v1/ai-configs/providers`
- 画布布局：`PUT /api/v1/dramas/:id/canvas-layout`
- 任务状态：`GET /api/v1/tasks/:id`
- 整集合成：`POST /api/v1/episodes/:id/finalize`

API Key、供应商地址、运行设置和可选默认模型只读取仓库根目录私有 `config.yaml`；SQLite 只保存实时模型目录快照，不保存密钥。没有真实凭据时，确定性测试只证明请求合同和内部编排，不证明外部生成可用。
