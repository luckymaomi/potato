# tomato-ai-drama Spec

## 产品定位

- 产品是什么：本地 AI 短剧和视频生成工作台。
- 服务对象：需要把提示词、参考图、视频和短剧资源组织成可重复流水线的创作者。
- 交付形态：Vite Web 前端，可由现有 Electron/本地 Node 环境承载；本仓库暂不新增 Electron 壳。
- 工作代码全部在本仓库实现；本项目独立运行，不依赖其他项目的前端或运行时目录。

## 核心用户路径

1. 打开项目列表，新建或导入一个项目。
2. 进入 `/film/:id/canvas`，以分层 DAG 组织“故事 → 剧本 → 资产提取/资产图 → 分镜图 → 镜头视频 → 整集合成”。
3. 节点插件集中声明角色、输入输出、参数、提示词、默认方式和命令；画布快照只保存角色、用户参数、稳定资产 ID、结果、历史与状态。
4. 每个节点的右侧面板提供完整的独立输入；连线只把已经完成的直接上游文字、图片或视频追加给当前节点。删除连线后，节点仍可使用面板配置独立运行。
5. 单节点运行只运行当前节点，不补跑祖先，也不因未完成上游而阻断；整组运行按完整显式 DAG 拓扑排序。结果、真实任务百分比和阶段消息写回画布，顶部同时显示当前节点与完成数/总数；运行期间可停止当前任务和后续编排。

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
- 节点上下文解析：`frontend/src/features/production/contextResolver.ts`
- 生产节点执行器：`frontend/src/features/production/executor.ts`
- 画布图规则与运行编排：`frontend/src/features/canvas/canvasGraph.ts`、`workflowRunner.ts`
- 直接关联高亮：`frontend/src/features/canvas/connectionHighlight.ts`、`ConnectionHighlightProvider.tsx`、`CanvasEdge.tsx`
- 检查器短标签：`frontend/src/features/canvas/inspectorPresentation.ts`
- 运行停止：`frontend/src/features/canvas/runSession.ts`
- 画布状态：`frontend/src/store/canvasStore.ts`
- API 适配：`frontend/src/api/`
- 后端领域和持久化：`backend/src/routes/`、`backend/src/services/`、SQLite
- 资产仓库：`backend/src/services/assetRepository.ts`
- 本地媒体与归档：`backend/src/services/mediaArchiveService.ts`、`projectArchiveService.ts`
- 文本提示词目录：`backend/src/services/textPromptCatalog.ts`

## 业务边界

当前支持：项目管理、DAG 画布、节点插件目录、手动或 AI 文本、公开可编辑的默认系统提示词、图片/视频四种生成模式、稳定资产仓库、逐镜资产关系、资产图、分镜图、镜头视频、可停止的整组运行、整集合成、生成历史选择及携带本地媒体的项目归档。

当前不做：浏览器直连供应商、独立节点/边数据库表、Electron 新壳、无凭据条件下的外部生成成功承诺。

必须由人工判断：供应商参数是否适合具体模型、生成结果质量、最终成片内容和生产环境密钥管理。

## 持久化与恢复

- 当前是快速开发期，不存在迁移或旧 schema 兼容。`backend/src/db/schema.ts` 是唯一数据库结构 owner，应用在空数据目录中直接创建当前结构。普通启动、测试和构建保留 `backend/data`；只有 owner 明确要求时，执行者才在停止服务后手工删除该目录，项目不提供自动清库命令。

- 项目、剧集、角色、场景、道具、分镜、生成记录、任务和全局模型预设由后端 SQLite 负责。
- `catalog.ts` 是节点插件事实 owner；新增节点类型只注册插件。`contextResolver.ts` 只读取插件声明与已经完成的直接入边，不用标题、位置、长祖先链或资产仓库猜输入。角色、场景、道具和分镜的稳定 ID、项目归属及分镜关联由 `AssetRepository` 拥有，但仓库记录不作为生成命令的隐式输入。
- 自由画布节点、坐标、连线、工作流组和模板通过 `/api/v1/dramas/:id/canvas-layout` 保存到 `dramas.metadata.canvas_layout`，它是唯一画布快照；不存在重复的顶层工作流组写入。选择、框选、拖动中状态等标签页瞬时信息不进入快照。
- 前端画布保存协调器对不可变业务快照做指纹去重和防抖，所有请求严格串行；保存进行中的新修改继续排队，旧请求完成不能把新修改误报为已保存。自动保存状态和错误在画布顶栏可见，失败快照保留并可重试；生成和内部导航前会 flush，尚有待保存内容时浏览器关闭会触发原生提示。
- `dramas.canvas_revision` 是画布并发版本 owner。保存请求必须携带 `expected_revision`，SQLite 在同一事务内 compare-and-set 并递增；同一旧 revision 再次保存返回 HTTP 409，不覆盖新版本。当前无旧数据兼容或迁移入口。
- 任务提交后前端轮询 `/api/v1/tasks/:id`，直接消费后端持久化的 `progress` 与 `message`；节点和检查器显示真实百分比与阶段，整组运行顶部显示完成数、总数和当前节点。`execution.startedAt` 记录本次运行起点，显示层每秒计算并展示真实耗时，但不把耗时写入画布状态或换算成进度。没有供应商真实百分比时只显示阶段，不伪造进度。运行会话只记录一个当前后端任务，停止时调用取消接口、终止轮询并拒绝继续提交后续节点；后端在持久化文本或媒体结果前再次检查取消。第三方没有撤销协议时，不承诺其远端计算被物理删除。节点的 `manuallyCompleted` 是持久化的运行范围开关：开启时单节点、下游、全部和未完成范围都跳过该节点，关闭后恢复；它不构造结果，也不让下游消费不存在的数据。节点已有可复用结果时，重跑失败或停止会恢复旧完成态和旧结果，并保留本次重跑提示。
- React Flow 直接消费 Zustand 的原始 `nodes/edges`，画布页面不建立过滤副本。单选节点时，显示层用 memoized ID 集合投影直接邻居和对应边；它不修改 React Flow 多选、不进入业务 store 或快照。
- 每次选中节点都挂载该节点独立的检查器与 Form 实例，取消选择时卸载；Form 只接收 `title/parameters`，运行结果、历史和执行状态不进入表单。字段编辑和自动保存返回不再整表重置。模型选择只显示模型标识，能力标签在独立区域换行；生成历史以本地时间、短版本号和缩略内容呈现。
- 文本提示词目录由后端唯一维护并通过 `/api/v1/production/text-prompts` 公开。检查器显示完整默认值，用户覆盖值随 `system_prompt` 到达 Provider；恢复默认后画布不重复保存默认正文。文本节点的面板文本是完整输入，已经完成的直接文本入边只做追加；没有关联剧集时，提取与分镜文本仍可独立返回结果。
- 参考图在每个节点自己的 `parameters.referenceImages` 中独立保存 URL 或 `/static/uploads/...` 路径；创建、恢复和更新节点时都复制数组，检查器切换节点会显式灌入当前节点列表，未上传的节点显示空列表。图片生成提交前由后端统一校验本地文件并临时转换为带 MIME 的 Base64 data URL，远端供应商不会收到不可访问的 localhost 地址。
- 供应商返回图片或视频后，后端必须下载、验证媒体签名并原子写入 `storage/projects/<projectId>/images|videos/`；只有本地文件完成才把 generation 标成 completed。来源 URL 单独保留，供应商失败、本地归档失败和本地合成失败分别记录，不用远端成功冒充本地完成。
- 每次图片、镜头视频和整集合成都创建独立 generation；画布节点的 `result.generationId` 是当前采用版本，`history` 保留该节点历次成功结果。检查器只显示本节点历史并可切换当前版本；旧记录和旧文件不被新结果覆盖。存在明确业务输出目标时，资产、分镜或剧集也可保存当前 generation 指针。
- `backend/logs/everything.log` 是默认持久 Everything 日志，不随 `backend/data` 清理而删除。HTTP 请求、项目与画布 CRUD、生产命令、任务生命周期、供应商阶段、本地归档、合成、Demo 初始化和验收脚本都写入 JSONL；凭据、授权头、查询串、Data URL 与二进制统一脱敏。
- 项目 ZIP v2 包含当前 schema 数据、全部生成历史和已落盘媒体。导出以文件流写入临时 ZIP，导入上传直接写后端临时磁盘并逐条目流式解压，没有人为 ZIP 大小上限；成功或失败均清理传输文件。导入会校验路径和媒体签名、重建 ID/指针/画布引用，展示不依赖供应商 URL。
- 第三方 API Key 和供应商地址只读取根目录私有 `config.yaml`，不进入前端、SQLite 或静态产物；`config.example.yaml` 只提供无密钥结构。AI 配置页保存的文本、图片、视频全局模型预设只包含供应商 ID 与模型 ID，持久化到 `ai_model_presets`。`config.yaml` 不保存模型选择。
- PearAPI 图片与视频统一使用官方 `/v1` 协议和 `Authorization: Bearer` 鉴权；不再支持旧 `/api/*`、JSON `generation_key` 或可配置旧端点。图片固定异步提交 `task_type=async`；Grok Imagine Video 1.5 提交使用 `mode`、`seconds`、`aspect_ratio` 和 `images`，不发送通用兼容字段 `duration`、`reference_contents`。
- 供应商运行时由 `backend/src/providers/` 维护：统一合同、能力目录、注册中心、HTTP 传输、轮询运行时和供应商适配器分层。当前只注册 Agnes 与 PearAPI，未知供应商明确拒绝；前端从 `/api/v1/ai-configs/providers` 读取目录，不能自由填写未注册供应商。
- Agnes 与 PearAPI 都通过实时目录声明文本、图片和视频能力。未来新增供应商只新增适配器并注册，文本、图片和视频业务服务不增加供应商分支。
- 模型列表不在前端或 Provider 描述符中写死。选择优先级是节点显式模型 → AI 配置页全局预设 → 第一个满足当前模式、参考图和画幅要求的模型。三类全局预设均可留空；保存时后端验证供应商已启用、已配置且模型真实存在于对应类型的实时目录。`config.yaml` 只保存供应商连接所需的固定配置，不保存模型选择。
- 媒体模型目录同时返回支持的生成模式、最大参考图数量和画幅比例。画布按模式过滤模型、按具体模型展示比例；自动选模型也必须满足所选比例。后端在生成记录落库和外部任务创建前再次校验，未知比例能力不能冒充可用。
- 视频模型目录分开声明计费维度与时长能力：`billingMode` 表示按时长/按次，`supportsDuration` 与 `supportedDurations` 表示请求能力。PearAPI 官方 Grok 1.5 支持 4/6/8/10/12/15 秒且按次计费，因此可选时长不能由计费维度推断。
- 《雨夜外卖》Demo 的镜头视频默认时长为 15 秒，10 个镜头合计剧集预估时长为 150 秒；这不改变通用视频节点和起步工作区的默认值。
- 图片 Provider 请求中的 `aspectRatio` 与分辨率 `size` 独立；Agnes 映射为 `ratio`，PearAPI 映射为图片接口的 `size`。视频统一映射为供应商的 `aspect_ratio`。
- Provider 文本、图片和视频生成调用不设置本地应用超时，Undici 的响应头和响应体超时也显式关闭；模型目录等非生成查询保留 30000ms。取得供应商任务 ID 后，图片、视频与前端任务状态都不设累计截止线：供应商明确成功则进入归档，明确失败则失败，用户主动停止则取消；暂时性查询错误继续等待并记录审计事件。初次生成提交不做网络异常盲目重发，避免供应商已经受理但响应丢失时重复扣费。
- 后端 `tsconfig.json` 对全部源码、脚本和测试启用 `strict`、`noImplicitAny`、`strictNullChecks` 与 `useUnknownInCatchVariables`；不存在局部宽松配置。

## 验收标准

- 后端能从空 `backend/data` 初始化、启动并返回健康状态。
- 后端全局严格 TypeScript 检查为 0 诊断，构建前会清除旧产物。
- 前端能构建并启动，项目列表能真实读取和创建项目。
- 能进入画布、拖动节点、自由连线、框选和整组运行。
- 默认模板与《雨夜外卖》Demo 是无环分层图；画布可直接看到资产一对多、镜头多输入和十路镜头视频汇入合成。Demo 文本由仓库定义预写，所有 AI 节点的供应商和模型默认留空，统一消费 AI 配置页的全局预设或实时目录自动选择结果。
- 有真实 AI 配置时，四种图像/视频模式能够提交并轮询任务；无配置时后端拒绝原因可见。
- 能提交整集合成；缺少输入视频时保留后端明确错误，不伪造成功。
- 全局界面不使用单边彩色竖条、单边框或伪元素制作的状态强调样式。

## 当前交付状态

- 项目管理、插件化生产核心、稳定资产仓库、本地媒体历史、流式项目归档、DAG 默认模板和供应商无关的《雨夜外卖》预写 Demo 已由当前 `frontend/` 与 `backend/` 主干实现。
- Demo v19 含 36 个节点、56 条依赖边与 1 个工作流组：1 个故事、1 个剧本、3 组预写提取文本、10 个独立资产图、10 张 `1:1` 九宫格分镜图、10 段默认 15 秒的 `9:16` 镜头视频和 1 个整集合成。镜头描述分别保存在分镜图与视频节点面板；资产图不依赖提取节点，镜头 6/7/9/10 的入边按 owner 指定资产集合建立，合成节点有 10 个镜头视频入边。Demo 不写死供应商或模型。
- `backend/scripts/initializeRainyNightDemo.ts` 是唯一可恢复 Demo 初始化入口：不调用供应商、不生成媒体、不清库；同版本半成品会原位补齐，完整 Demo 重复初始化不创建第二个项目也不覆盖完整画布。`npm.cmd run accept:rainy-night-demo` 直接复用该入口，只初始化，不执行真实工作流。
- 前端确定性测试覆盖插件合同、节点自治、DAG 无环结构、只追加已完成直接入边、逐镜精确资产、拓扑排序、循环拒绝、手动完成跳过、旧结果重跑恢复、媒体展示、历史选择和运行停止。
- 保存测试覆盖连续快照合并、写入串行、revision 递增、失败保留与重试、冲突停止覆盖，以及节点/连线选择态不持久化。
- 本轮确定性结果：前端 17 个测试文件 59/59、lint、build 通过；后端 65/65、strict typecheck、build 通过。owner 已明确要求代理不运行初始化脚本或真实媒体链；浏览器交互和真实外部结果不能由自动测试替代。
