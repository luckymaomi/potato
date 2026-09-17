# tomato-ai-drama Spec

## 产品定位

- 产品是什么：本地 AI 短剧和视频生成工作台。
- 服务对象：需要把提示词、参考图、视频和短剧资源组织成可重复流水线的创作者。
- 交付形态：Vite Web 前端，可由现有 Electron/本地 Node 环境承载；本仓库暂不新增 Electron 壳。
- 工作代码全部在本仓库实现；本项目独立运行，不依赖其他项目的前端或运行时目录。

## 核心用户路径

1. 打开项目列表，新建或导入一个项目。
2. 进入 `/film/:id/canvas`，按“故事 → 剧本 → 资产 → 分镜清单 → 分镜图 → 镜头视频”添加或编辑节点。
3. 节点只保存稳定的生产角色；文本/图片/视频材料、生产阶段与角色/场景/道具资产分类由唯一角色目录派生。文本可手动粘贴或选配 AI，媒体可选择文本生成或参考图生成。
4. 拖动节点建立连接，框选多个节点后整组运行；结果和任务状态写回节点并保存到项目 metadata。运行期间可停止当前任务和后续编排。
5. 选择剧集提交整集合成。

## 当前事实

- 后端源码入口：`backend/src/server.ts`；正式构建入口：`backend/dist/server.js`，端口默认 `5679`。
- 前端入口：`frontend/src/main.tsx`，端口默认 `3012`。
- API 前缀：`/api/v1`；Vite `/api`、`/static` 代理到后端。
- 前端验证：`npm.cmd run build`、`npm.cmd run lint`。
- 后端验证：`npm.cmd run dev`、`GET /health`；普通启动、测试和构建都不会删除 `backend/data`。
- 后端能力和 `/api/v1` 接口合同在本项目内维护；前端只依赖本仓库的 `backend`，不读取外部项目目录。

## 项目地图

- 项目列表：`frontend/src/pages/ProjectsPage.tsx`
- AI 配置：`frontend/src/pages/AiConfigPage.tsx`
- 画布：`frontend/src/features/canvas/CanvasPage.tsx`
- 节点与检查器：`frontend/src/features/canvas/CanvasNode.tsx`、`CanvasInspector.tsx`
- 唯一生产角色目录：`frontend/src/features/production/catalog.ts`
- 生产节点执行器：`frontend/src/features/production/executor.ts`
- 画布图规则与运行编排：`frontend/src/features/canvas/canvasGraph.ts`、`workflowRunner.ts`
- 运行停止：`frontend/src/features/canvas/runSession.ts`
- 画布状态：`frontend/src/store/canvasStore.ts`
- API 适配：`frontend/src/api/`
- 后端领域和持久化：`backend/src/routes/`、`backend/src/services/`、SQLite
- 文本提示词目录：`backend/src/services/textPromptCatalog.ts`

## 业务边界

当前支持：项目管理、画布拓扑、手动或 AI 文本、公开可编辑的默认系统提示词、图片/视频四种生成模式、资产图、分镜清单、分镜图、镜头视频、可停止的整组运行和整集合成。

当前不做：浏览器直连供应商、独立节点/边数据库表、Electron 新壳、无凭据条件下的外部生成成功承诺。

必须由人工判断：供应商参数是否适合具体模型、生成结果质量、最终成片内容和生产环境密钥管理。

## 持久化与恢复

- 当前是快速开发期，不存在迁移或旧 schema 兼容。`backend/src/db/schema.ts` 是唯一数据库结构 owner，应用在空数据目录中直接创建当前结构。普通启动、测试和构建保留 `backend/data`；只有 owner 明确要求时，执行者才在停止服务后手工删除该目录，项目不提供自动清库命令。

- 项目、剧集、角色、场景、道具、分镜、生成记录和任务由后端 SQLite 负责。
- 自由画布节点、坐标、连线、工作流组和模板通过 `/api/v1/dramas/:id/canvas-layout` 保存到 `dramas.metadata.canvas_layout`，它是唯一画布快照；不存在重复的顶层工作流组写入。选择、框选、拖动中状态等标签页瞬时信息不进入快照。
- 前端画布保存协调器对不可变业务快照做指纹去重和防抖，所有请求严格串行；保存进行中的新修改继续排队，旧请求完成不能把新修改误报为已保存。自动保存状态和错误在画布顶栏可见，失败快照保留并可重试；生成和内部导航前会 flush，尚有待保存内容时浏览器关闭会触发原生提示。
- `dramas.canvas_revision` 是画布并发版本 owner。保存请求必须携带 `expected_revision`，SQLite 在同一事务内 compare-and-set 并递增；同一旧 revision 再次保存返回 HTTP 409，不覆盖新版本。当前无旧数据兼容或迁移入口。
- 任务提交后前端轮询 `/api/v1/tasks/:id`；完成、失败、停止和超时都会在节点上显示状态。运行会话只记录一个当前后端任务，停止时调用取消接口、终止轮询并拒绝继续提交后续节点；后端在持久化文本或媒体结果前再次检查取消。第三方没有撤销协议时，不承诺其远端计算被物理删除。
- 文本提示词目录由后端唯一维护并通过 `/api/v1/production/text-prompts` 公开。检查器显示完整默认值，用户覆盖值随 `system_prompt` 到达 Provider；恢复默认后画布不重复保存默认正文。手动剧本会写入关联剧集，提取和分镜操作可用 `source_text` 消费连线文本。
- 参考图在画布中只保存 URL 或 `/static/uploads/...` 路径；图片生成提交前由后端统一校验本地文件并临时转换为带 MIME 的 Base64 data URL，远端供应商不会收到不可访问的 localhost 地址。检查器同时保留 URL 添加和本地多图上传，并以可预览、可删除的缩略图展示；生成后的图片也在检查器中直接显示缩略图，可点开大图或在新窗口打开，视频结果在同一区域提供播放预览。
- 第三方 API Key、供应商地址和可选默认模型只读取根目录私有 `config.yaml`，不进入前端、SQLite 或静态产物；`config.example.yaml` 只提供无密钥结构。
- PearAPI 的凭据按官方协议严格分离：`api_key` 是 `/v1` 接口请求头使用的 `sk-` 令牌，`settings.generation_key` 是图片/视频 `/api` 接口请求体使用的普通分发 Key；媒体调用不允许在缺少普通 Key 时回退到 `sk-` 令牌。
- 供应商运行时由 `backend/src/providers/` 维护：统一合同、能力目录、注册中心、HTTP 传输、轮询运行时和供应商适配器分层。当前只注册 Agnes 与 PearAPI，未知供应商明确拒绝；前端从 `/api/v1/ai-configs/providers` 读取目录，不能自由填写未注册供应商。
- Agnes 与 PearAPI 都通过实时目录声明文本、图片和视频能力。未来新增供应商只新增适配器并注册，文本、图片和视频业务服务不增加供应商分支。
- 模型列表不在前端或 Provider 描述符中写死；节点可显式选模型，也可使用 `config.yaml` 的 `default_models`。配置的默认值不在实时目录时，后端明确拒绝。
- 媒体模型目录同时返回支持的生成模式、最大参考图数量和画幅比例。画布按模式过滤模型、按具体模型展示比例；自动选模型也必须满足所选比例。后端在生成记录落库和外部任务创建前再次校验，未知比例能力不能冒充可用。
- 图片 Provider 请求中的 `aspectRatio` 与分辨率 `size` 独立；Agnes 映射为 `ratio`，PearAPI 映射为图片接口的 `size`。视频统一映射为供应商的 `aspect_ratio`。
- 后端 `tsconfig.json` 对全部源码、脚本和测试启用 `strict`、`noImplicitAny`、`strictNullChecks` 与 `useUnknownInCatchVariables`；不存在局部宽松配置。

## 验收标准

- 后端能从空 `backend/data` 初始化、启动并返回健康状态。
- 后端全局严格 TypeScript 检查为 0 诊断，构建前会清除旧产物。
- 前端能构建并启动，项目列表能真实读取和创建项目。
- 能进入画布、拖动节点、自由连线、框选和整组运行。
- 有真实 AI 配置时，四种图像/视频模式能够提交并轮询任务；无配置时后端拒绝原因可见。
- 能提交整集合成；缺少输入视频时保留后端明确错误，不伪造成功。
- 全局界面不使用单边彩色竖条、单边框或伪元素制作的状态强调样式。

## 当前交付状态

- 项目管理、默认模板、Agnes 完整 Demo、节点 CRUD、工作流组和四种媒体运行模式已由当前 `frontend/` 与 `backend/` 主干实现。
- Agnes Demo v8 含 18 个节点、27 条曲线连线与 5 个工作流组；使用当前生产角色合同，覆盖双角色、双场景、双道具和三个分镜媒体分支，所有媒体节点默认 `9:16`。除手工故事外所有运行节点明确选择 Agnes，模型由实时目录与根配置决定。分镜数量固定为 3；模板从已有剧本、记录、分镜和媒体结果重新水合。
- 前端确定性测试覆盖节点目录、模板结构、下游范围、拓扑排序、循环拒绝、连线文本/图片输入、记录 ID 传递、手动剧本持久化、媒体展示和运行停止。
- 保存测试覆盖连续快照合并、写入串行、revision 递增、失败保留与重试、冲突停止覆盖，以及节点/连线选择态不持久化。
- Agnes 的文本、文生图、图生图、文生视频、图生视频与整集合成已做真实验收；其中本地上传图转换 Base64 后通过 `agnes-image-2.5-flash` 完成真实图生图。PearAPI 使用普通分发 Key 和 `gpt-image-2` 完成一次真实文生图，证明媒体调用凭据链路可用；余额查询示例仍与服务端参数解析不一致。浏览器人工视觉验收尚未完成。
