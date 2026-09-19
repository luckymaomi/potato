# 当前任务

## 任务标题

断裂式信息架构重建：剧本台 / 资产库（人物·场景·道具）/ 分镜台 / 生产成片；废除“纯 DAG 画布吞掉全部短剧阶段”。

## 审核与授权状态

- **Owner 已口头确认（2026-09-19）**：方向通过；跨项目资产采用锁定版本；生产区 v1 不以无限画布为主路径；顶栏人物/场景/道具三个入口；实施期允许清空 `backend/data`；保留统一默认供应商与全局模型预设。
- 交流时用短重点；**本文件保持尽量详细**，作为唯一执行合同。
- **未开始改产品代码前**：以本文件为准；实施启动需再确认“现在开干”。
- 上一份 PearAPI / 未知模型能力 `plan.md` 已完成，事实在 `history.md` / `spec.md`；本文件整份替换，不混写。

---

## 需求

### 产品要解决的问题

当前打开项目几乎只有 `/film/:id/canvas`，把故事、提取、资产、分镜、视频、合成全画成节点与连线。用户心智是短剧制作（剧本 → 可复用资产 → 分镜说明书 → 逐镜生成 → 成片），产品却像 ComfyUI 工作流台。领域表其实已有剧集/角色/场景/道具/分镜，UI 没有按对象组织。

### 目标用户路径（可观察）

1. 项目列表新建或打开项目。
2. 进入项目壳，顶栏进入：**剧本 | 人物 | 场景 | 道具 | 分镜 | 生产**。
3. **剧本台**：编辑故事梗概与本集剧本；可手动保存；可走 AI 扩写/改写（消费全局默认文本模型，可覆盖）。
4. **人物 / 场景 / 道具**：维护本项目资产；可从剧本提取；可文生图、图生图；可切换历史版本并锁定当前标准图；可打开全局库把已有资产**以锁定版本加入本项目**。
5. **分镜台**：有序镜头表；每镜绑定出场人物/场景/道具、剧情与提示词；可 AI 从剧本拆镜。
6. **生产**：按分镜列表单镜或批量生成分镜图、镜头视频；按序整集合成。v1 **不做**生产无限画布主路径。
7. AI 配置页的文本/图片/视频**全局默认模型**继续作为全站统一默认；各处生成可显式覆盖，不得另起一套供应商心智。

### 成功标准

- 主路径不再依赖“36 节点 DAG 才能看懂资产复用”。
- 同一全局资产可被多个项目引用；旧项目绑定的 generation 不因全局后来换图而静默变脸（锁定版本）。
- 资产页可完成文生图与图生图，结果写入资产当前指针与历史。
- 《雨夜外卖》类 Demo 以剧本 + 资产库 + 分镜表 + 空生产结果呈现，不初始化旧 canvas 主图。
- Provider、任务、本地归档、Everything 日志、项目 ZIP、全局模型预设行为不回退。

---

## 当前事实

### 路由与 UI

- 现：`/`、`/ai-config`、`/film/:id/canvas`。打开项目 ≈ 纯画布。
- `spec.md` 仍写 DAG 为核心用户路径；`reference/README.md` 曾记录“拒绝阶段表单、坚持纯画布”——本任务正式推翻该 UI 取舍。

### 数据

- 已有：`dramas`、`episodes.script_content`、`characters` / `scenes` / `props`（均 `drama_id`）、`storyboards`、分镜–资产关联表、`image_generations` / `video_generations`、`ai_model_presets`、`canvas_revision` + `metadata.canvas_layout`。
- **缺口**：无全局资产库；资产不能跨项目；UI 真相在 canvas_layout，与领域表双轨。
- 快速开发期：`schema.ts` 唯一结构 owner；无生产迁移义务；owner 已允许实施时清空 `backend/data`。

### 生成与配置（保留）

- 资产插件已支持 `text-to-image` / `image-to-image`。
- 模型选择优先级已是：显式选择 → **AI 配置页全局预设** → 自动选择。本任务不改这条优先级，只让新工作区统一遵守。
- Agnes / PearAPI、异步任务、本地媒体归档、历史 generation、Everything 日志继续作为基础设施。

### 参考（只读学习，不复制代码）

- 魔因：`剧本 → 角色 → 场景 → 导演分镜 → 批量出片`（板块划分主参考，不抄死 UI）。
- 火宝：改写 → 提取资产出图 → 拆分镜 → 视频 → 合成。
- dramai / micro-drama / ai-story 等：同一内容主链的不同外壳。
- 学习态度：**学成熟骨架，不把某一家的屏幕布局、命名、Agent 数量、画布形态固定成唯一正确答案。**

---

## 失败证据

- Owner 多次反馈页面组织不像短剧制作；概念主链已对齐，产品仍是一张 DAG。
- 起步模板与 Demo 对提取→资产→分镜的边不一致；Demo 资产不连提取且无分镜清单节点。
- 用连线表达资产一对多导致蛛网；折叠方案又因 React Flow 稳定性删除——说明**用图表达领域关系是错误载体**。
- `characters.drama_id` 等使跨项目复用在合同上不成立。

---

## 目标

### 信息架构（已拍板）

```text
/                         项目列表
/ai-config                AI 配置（全局默认供应商/模型）——保留并全站统一消费
/film/:id                 项目壳 → 默认进剧本
/film/:id/script          剧本台
/film/:id/characters      人物资产
/film/:id/scenes          场景资产
/film/:id/props           道具资产
/film/:id/assets/library  全局资产库（选用并锁定版本到本项目）
/film/:id/storyboard      分镜台
/film/:id/produce         生产成片（列表 + 批量 + 合成）
```

- **废除** `/film/:id/canvas` 作为主入口（可 301/重定向到 script 或 produce；v1 不提供生产无限画布页）。
- 顶栏六个入口（已拍板）：剧本、人物、场景、道具、分镜、生产。

### 对象模型（已拍板：全局库 + 项目绑定锁定版本）

| 对象 | 说明 |
|------|------|
| Drama / Episode | 项目与剧集；剧集持有剧本正文与成片指针 |
| `asset_library_items` | 全局资产：kind=character\|scene\|prop；描述；`current_image_generation_id` |
| `project_assets` | 本项目绑定：`drama_id` + `library_item_id` + **`locked_image_generation_id`**（绑定时锁定的外观版本）+ 可选本地覆盖字段 |
| Storyboard | 有序镜头；文本字段；关联 `project_assets`；`current_image_generation_id` / `current_video_generation_id` |
| Generations / Tasks | 沿用现有图片视频 generation 与异步任务 |

**锁定版本语义（必须测）：**

- 加入项目时：写入 `locked_image_generation_id = 当时库的 current`（若无图可为 null）。
- 全局库后来换新标准图：**不自动**改已绑定项目的 `locked_*`。
- 项目资产详情提供显式动作「升级到库最新版」才会更新锁定指针。
- 生产取参考图：优先 `project_assets.locked_image_generation_id`，而非每次读库最新。

### 生成合同修订

| 旧 | 新 |
|----|----|
| 画布节点面板完整输入；连线追加；仓库不暗取 | 工作区表单完整输入；**分镜/资产生产按显式 ID 取锁定标准图与文本** |
| DAG 表达依赖 | 数据关系表达依赖 |
| 默认供应商仅节点/配置页 | **所有工作区**统一：显式 → 全局预设 → 自动 |

### 各区职责

**剧本台**

- 字段：故事（项目描述或独立字段）、本集剧本。
- 动作：保存；AI 生成/改写（`write-script` / `generate-text` 等现有文本动作）。
- 不在此区生成图片视频。

**人物 / 场景 / 道具**

- 列表 + 详情。
- 创建：手建 / 从剧本提取（可复用 extract agents 的文本能力，结果落 `project_assets` 并可选同时写入/关联 library）。
- 生图：文生图、图生图（参考图上传）；历史与当前指针；锁定。
- 入口「从全局库添加」→ library 页多选 → 创建 `project_assets` 行并锁定版本。

**分镜台**

- 有序表（拖拽排序）；增删改。
- 每镜：标题、描述/动作、对白、时长、image_prompt、video_prompt、出场资产多选（按 kind 过滤）。
- AI 拆镜：读本集剧本 + 本项目资产列表，写出分镜并建议绑定（可先绑定名称匹配，人工可改）。
- 不在此区直接拼成片；可「去生产该镜」。

**生产**

- 行=分镜：分镜图状态、视频状态、单镜生图、单镜生视频。
- 批量：未完成分镜图 / 未完成视频。
- 整集合成：按分镜顺序收集可用视频 URL/本地路径。
- 组装生图输入：分镜 prompts + 该镜绑定资产的**锁定版**标准图列表 + 全局/显式图片模型。
- v1 无画布页。

### Demo

- 初始化脚本改写：写剧本、全局或项目资产、10 条分镜与关联；不写旧 canvas_layout 主图；不调用供应商。
- 验收：对象计数与关联正确，而非 36 节点 56 边。

### 删除与降级

- 删除起步 DAG 模板、旧 Demo 节点工作区作为主交付。
- `catalog.ts` 收缩为工作区可调用的生产动作（或拆 script/asset/shot actions）；删除“舞台=画布泳道”心智。
- 旧 `characters/scenes/props` 表由新 library + project_assets 取代（空库重建，不清迁移）。
- 旧 canvas 保存 API 可暂时保留只读或删除；以实施时影响面最小为准，但主路径不得再依赖。

---

## 不做范围

- 不复制 reference 源码/品牌/皮肤；不引入 Toonflow。
- v1 不做：生产无限画布、完整 NLE、口型、配音必达、多人协作、Electron 新壳、旧画布自动迁移。
- 不改“无凭据不伪造成功”；不浏览器直连供应商。
- 不另建第二套默认供应商配置。

---

## 设计细节

### API 草案（实施时可微调路径，职责锁定）

- `GET/PUT /api/v1/dramas/:id/script` — 故事+剧本
- `GET/POST /api/v1/asset-library` — 全局库
- `GET/PATCH /api/v1/asset-library/:id`
- `POST /api/v1/asset-library/:id/generate-image` — 文生/图生，写库当前指针与历史
- `GET/POST /api/v1/dramas/:id/assets` — 本项目资产；POST 可 `from_library_item_id` 并锁定
- `POST /api/v1/dramas/:id/assets/:id/generate-image`
- `POST /api/v1/dramas/:id/assets/:id/upgrade-lock` — 升到库最新
- `POST /api/v1/dramas/:id/assets/extract` — 从剧本提取
- `GET/PUT /api/v1/dramas/:id/storyboards` — 列表与排序
- `POST /api/v1/dramas/:id/storyboards/split` — AI 拆镜
- `POST /api/v1/dramas/:id/storyboards/:id/generate-image|generate-video`
- `POST /api/v1/dramas/:id/produce/batch` — 批量范围
- `POST /api/v1/dramas/:id/episodes/:eid/compose` — 整集合成

生产命令仍可汇入现有 `ProductionWorkflowService`，但 **target 从 canvas node 改为 domain id**。

### 前端模块建议

- `features/project-shell` — 顶栏与出口
- `features/script` — 剧本台
- `features/assets` — 人物/场景/道具/全局库
- `features/storyboard` — 分镜台
- `features/produce` — 生产列表与批量
- 大幅删除或归档 `features/canvas` 主路径依赖；执行器能力下沉到 shared production API 客户端

### 统一模型选择（已拍板保留）

所有生成入口共用同一解析函数：

1. 请求体显式 `provider`+`model`（若有）
2. 否则 `ai_model_presets` 对应 text/image/video
3. 否则实时目录自动选择（现有规则：固定选择不静默切换；仅空时自动）

UI：工作区显示“当前使用：全局默认 xxx / 已覆盖 yyy”，避免用户以为各区各有供应商。

### 影响面

- 前端路由、几乎全部 canvas 页面与测试、Demo/starter、catalog/executor/contextResolver
- 后端 schema、AssetRepository、分镜与生产入口、Demo init、ZIP 导入导出（需认识新表与锁定字段）
- 文档：`spec.md` 核心路径重写、`README.md`、`history.md`、本 plan 收口
- 保留：`backend/src/providers/**`、任务、媒体归档、Everything、AI 配置页

### 实施波次

1. **清库授权确认后**：停服务 → 删 `backend/data` → 新 schema  
2. API：library / project_assets / script / storyboards  
3. 项目壳 + 六入口空壳可导航  
4. 剧本台可写 + AI 文本  
5. 三资产页 + 全局库 + 文生/图生 + 锁定/升级  
6. 分镜台 + AI 拆镜 + 绑定  
7. 生产单镜/批量/合成  
8. 删旧 canvas 主路径；重写 Demo；全量测试；同步 spec/README/history  

每波交付应可演示，避免长期半新半旧。

---

## 不做的“死板”边界（执行纪律）

- 不要求 UI 像素级像魔因/火宝。
- 不要求必须上 Agent 框架或必须上时间线。
- 不要求分镜字段一次上齐所有电影术语；可先标题/描述/对白/时长/双提示词/资产绑定，再迭代景别运镜。
- 不把“列表 vs 轻微可视化”上升为宗教；v1 列表优先是为减范围，不是永久禁止画布。

---

## 实施任务

- [ ] Owner 确认「现在开干」（本文件决策已通过，仅差启动令）
- [ ] 停服务并清空 `backend/data`（启动令后执行）
- [ ] 断裂更新 `schema.ts`：library、project_assets（含 locked generation）、storyboards 关联新资产
- [ ] Script / Asset / Storyboard / Produce API
- [ ] 前端项目壳与六入口路由
- [ ] 剧本台
- [ ] 人物/场景/道具 + 全局库 + 文生图/图生图 + 锁定/升级
- [ ] 分镜台
- [ ] 生产列表/批量/合成（无画布）
- [ ] 统一模型选择接线到所有新入口
- [ ] 重写 Demo；移除旧 canvas 主路径与旧起步 DAG
- [ ] 测试与 spec/README/history；本 plan 收口勾选

---

## 验证计划

### 确定性

- 后端 typecheck / test / build；前端 test / lint / build  
- 契约：两项目引用同一 library item；A 升级库图后 B 未点升级则 locked 不变  
- 分镜生产组装包含锁定版参考图 URL/路径  
- Demo init 无供应商调用；无旧 36 节点断言  

### 真实外部（另授权）

- 资产文生、图生各 ≥1；一分镜图→视频；合成  
- 全局默认模型未设时行为与现合同一致  

### 人工

- 顶栏六入口是否好懂  
- 跨项目选用与升级是否符合预期  
- 是否仍感觉“在做短剧”而不是“搭工作流”

---

## 收口

- 完成事实：计划已按 owner 拍板决策重写为详细执行合同；**产品代码未改。**
- 实际命令：无。
- 未验证项：全部实现项。
- 剩余风险：启动令未下则不得清库；ZIP 格式随 schema 断裂需同步。
- 待 owner：回复「现在开干」后进入波次 1；若需先 commit 本 `plan.md`，请一并授权。
