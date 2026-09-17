# tomato-ai-drama

本地 AI 短剧生成工作台：在一个 React Flow 画布里完成“故事 → 剧本 → 角色/场景/道具资产 → 资产图 → 分镜清单 → 分镜图 → 镜头视频 → 整集”。

运行环境要求 Node.js 20.9 或更高版本。

## 当前能力

- React 18 + TypeScript + Vite 前端
- 项目列表：新建、打开、导入 ZIP、导出 ZIP
- AI 配置：从根配置读取 Agnes/PearAPI，页面查看状态并同步实时模型目录
- 画布节点只按文本、图片、视频区分材料；故事、剧本、资产提取、资产图、分镜清单、分镜图和镜头视频是生产用途
- 节点拖动、缩放、平移、框选、多选和自由连线
- 可靠自动保存：业务快照防抖合并、串行写入、保存状态可见、失败重试和 revision 冲突保护
- 文生图、图生图、文生视频、图生视频
- 图片与视频画幅比例跟随实时模型能力：节点只显示当前模型支持的比例，后端在创建任务前再次校验
- 参考图支持 URL 与本地多图上传，下方直接显示可预览、可删除的缩略图；本地图片仅在调用时转换为 Base64
- 图片生成结果在右侧检查器直接显示缩略图，并保留大图预览和新窗口打开；视频结果提供内嵌播放预览
- 角色/场景/道具资产图生成；资产图是跨镜头复用的标准图，分镜图是单个镜头画面
- 文本节点可纯手动，也可选配文本 API；六类默认系统提示词在检查器中完整可见、可编辑、可恢复默认
- 手动剧本运行后会写入关联剧集，后续提取和分镜也可直接消费连线传来的文本
- 分镜清单、分镜图、镜头视频按连线依赖运行；单节点、所选节点、下游分支、整个画布和整集合成都可停止
- 画布内提交整集合成
- Agnes 复杂 Demo：18 个节点、27 条曲线连线和 5 个工作流组，覆盖双角色、双场景、双道具、三个分镜图、三个分镜视频与整集合成，不使用假成功结果

后端 `backend` 是本项目的独立服务端目录，接口前缀为 `/api/v1`；前端和后端均以 `tomato-ai-drama` 为项目名。

## 快速开始

先启动后端：

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

另开终端启动前端：

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

后端也可以先构建再运行 `npm.cmd run build`、`npm.cmd run start:dist`。供应商采用统一核心合同 + 独立适配器设计，当前只注册 Agnes 与 PearAPI，两者都按实时目录声明文本、图片和视频能力；新增供应商时增加独立适配器并注册，不修改文本、图片或视频业务服务。没有真实凭据时不会把请求桩或模板占位内容当成生成成功。

首次运行先复制根配置并填写所需供应商凭据：

```powershell
Copy-Item config.example.yaml config.yaml
```

模型来自供应商实时目录。节点可以自行选模型；需要统一默认值时，可在对应供应商下配置可选的 `default_models.text/image/video`，其值必须来自实时目录。模型目录同时声明文生/图生模式、参考图上限和画幅比例；比例能力未知的媒体模型不会被静默当作可用。`config.yaml` 已被 Git 忽略，不要提交或分享。

PearAPI 的两种凭据用途不同，不能混用：`ai.providers.pearapi.api_key` 填默认渠道的 `sk-` 令牌，供 `/v1/models` 和文本接口使用；`ai.providers.pearapi.settings.generation_key` 填普通分发 Key，供图片和视频 `/api` 接口使用。缺少普通分发 Key 时媒体生成会直接报告配置错误，不会回退使用 `sk-` 令牌。

前端默认地址：`http://localhost:3012`。Vite 会把 `/api` 和 `/static` 转发到 `http://localhost:5679`。

Windows 下也可以运行根目录的 `python start.py`，它会分别打开后端和前端窗口并启动开发服务。

## 验证

```powershell
cd frontend
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd audit --audit-level=moderate
```

图片和视频生成需要在根 `config.yaml` 配置可用供应商凭据，再到 AI 配置页刷新实时模型目录。没有真实凭据时，项目仍可使用手动文本、画布编排和项目管理功能，但第三方生成会明确失败。

当前处于快速开发期，不维护数据库迁移或历史数据兼容。后端启动时由唯一 TypeScript schema 补齐当前数据库结构，但普通启动、测试和构建都不会删除 `backend/data`。只有 owner 明确要求清空数据时，才由执行者先停止服务并手工删除该目录；项目不提供自动清库命令。

画布节点、坐标、连线、工作流组和模板由 `canvas_layout` 一次性保存；选择、框选等当前标签页状态不会入库。节点只保存当前生产角色 `role`，材料、阶段、资产分类和默认运行方式都由唯一生产目录派生，不包含旧结构判断或转换。保存接口使用 `expected_revision` 做并发保护，同一旧版本不能覆盖其他页面已经保存的新版本。生成、手动保存和从画布内部跳转前都会先提交最新快照。

运行期间点击“停止运行”会立即停止前端轮询和后续节点提交，并调用 `POST /api/v1/tasks/:id/cancel` 取消当前本地任务。对于已经提交到第三方的异步生成，是否能撤销其远端计算取决于供应商；tomato-ai-drama 会停止本地跟踪并拒绝把迟到结果写成成功。

后端的完整严格 TypeScript 检查：

```powershell
cd backend
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## 了解更多

- 当前事实：`spec.md`
- 当前任务：`plan.md`
- 开发规则：`AGENTS.md`
- 设计调研：`reference/README.md`
- 贡献：`CONTRIBUTING.md`
- 安全：`SECURITY.md`
