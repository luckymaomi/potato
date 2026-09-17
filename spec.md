# mini-video Spec

## 产品定位

- 产品是什么：本地 AI 短剧和视频生成工作台。
- 服务对象：需要把提示词、参考图、视频和短剧资源组织成可重复流水线的创作者。
- 交付形态：Vite Web 前端，可由现有 Electron/本地 Node 环境承载；本仓库暂不新增 Electron 壳。
- 工作代码全部在本仓库实现；本项目独立运行，不依赖其他项目的前端或运行时目录。

## 核心用户路径

1. 打开项目列表，新建或导入一个项目。
2. 进入 `/film/:id/canvas`，从已有实体节点或创建菜单开始编辑。
3. 文本节点可手动粘贴，也可选择已有 AI 动作；媒体节点可选择文生或参考图模式。
4. 拖动节点建立连接，框选多个节点后整组运行；结果和任务状态写回节点并保存到项目 metadata。
5. 选择剧集提交整集合成。

## 当前事实

- 后端源码入口：`backend/src/server.ts`；正式构建入口：`backend/dist/server.js`，端口默认 `5679`。
- 前端入口：`frontend/src/main.tsx`，端口默认 `3012`。
- API 前缀：`/api/v1`；Vite `/api`、`/static` 代理到后端。
- 前端验证：`npm.cmd run build`、`npm.cmd run lint`。
- 后端验证：`npm.cmd run migrate`、`npm.cmd run dev`、`GET /health`。
- 后端能力和 `/api/v1` 接口合同在本项目内维护；前端只依赖本仓库的 `backend`，不读取外部项目目录。

## 项目地图

- 项目列表：`frontend/src/pages/ProjectsPage.tsx`
- AI 配置：`frontend/src/pages/AiConfigPage.tsx`
- 画布：`frontend/src/features/canvas/CanvasPage.tsx`
- 节点与检查器：`frontend/src/features/canvas/CanvasNode.tsx`、`CanvasInspector.tsx`
- 编排规则：`frontend/src/features/canvas/workflow.ts`
- 画布状态：`frontend/src/store/workbenchStore.ts`
- API 适配：`frontend/src/api/`
- 后端领域和持久化：`backend/src/routes/`、`backend/src/services/`、SQLite

## 业务边界

当前支持：项目管理、画布拓扑、文本编辑、图片/视频四种生成模式、资产参考图、分镜生成/分镜图、整组运行和整集合成入口。

当前不做：浏览器直连供应商、独立节点/边数据库表、Electron 新壳、无凭据条件下的外部生成成功承诺。

必须由人工判断：供应商参数是否适合具体模型、生成结果质量、最终成片内容和生产环境密钥管理。

## 持久化与恢复

- 项目、剧集、角色、场景、道具、分镜、生成记录和任务由后端 SQLite 负责。
- 自由画布节点、坐标、连线和工作流组通过 `/api/v1/dramas/:id/canvas-layout` 保存到 `dramas.metadata.canvas_layout`，新前端只使用这一套工作台结构。
- 任务提交后前端轮询 `/api/v1/tasks/:id`；完成、失败和超时都会在节点上显示状态，失败可再次运行。
- 第三方 API Key、供应商地址和可选默认模型只读取根目录私有 `config.yaml`，不进入前端、SQLite 或静态产物；`config.example.yaml` 只提供无密钥结构。
- 供应商运行时由 `backend/src/providers/` 维护：统一合同、能力目录、注册中心、HTTP 传输、轮询运行时和供应商适配器分层。当前只注册 Agnes 与 PearAPI，未知供应商明确拒绝；前端从 `/api/v1/ai-configs/providers` 读取目录，不能自由填写未注册供应商。
- Agnes 与 PearAPI 都通过实时目录声明文本、图片和视频能力。未来新增供应商只新增适配器并注册，文本、图片和视频业务服务不增加供应商分支。
- 模型列表不在前端或 Provider 描述符中写死；节点可显式选模型，也可使用 `config.yaml` 的 `default_models`。配置的默认值不在实时目录时，后端明确拒绝。
- 后端 `tsconfig.json` 对全部源码、脚本和测试启用 `strict`、`noImplicitAny`、`strictNullChecks` 与 `useUnknownInCatchVariables`；不存在局部宽松配置。

## 验收标准

- 后端能安装、迁移、启动并返回健康状态。
- 后端全局严格 TypeScript 检查为 0 诊断，构建前会清除旧产物。
- 前端能构建并启动，项目列表能真实读取和创建项目。
- 能进入画布、拖动节点、自由连线、框选和整组运行。
- 有真实 AI 配置时，四种图像/视频模式能够提交并轮询任务；无配置时后端拒绝原因可见。
- 能提交整集合成；缺少输入视频时保留后端明确错误，不伪造成功。
- 全局界面不使用单边彩色竖条、单边框或伪元素制作的状态强调样式。

## 当前交付状态

- 项目管理、默认模板、Agnes 完整 Demo、节点 CRUD、工作流组和四种媒体运行模式已由当前 `frontend/` 与 `backend/` 主干实现。
- Agnes Demo v4 含 11 个节点与 13 条曲线连线；除手工梗概外所有运行节点默认选择 Agnes，模型由实时目录与根配置决定。
- 前端确定性测试覆盖模板结构、下游范围、拓扑排序、循环拒绝、连线输入、实体 ID 和分镜 ID 传递。
- Agnes 的文本、文生图、图生图、文生视频、图生视频与整集合成已做真实验收；PearAPI 真实付费生成和浏览器人工视觉验收仍未完成。
