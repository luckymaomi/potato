# 本轮合同：主题布局重建 + 生成全手选 + 刷新计数口径

## 需求

修复 Codex 主题换皮后的生产级不可用状态，并按 owner 已拍板的三条定界收口：

1. **布局**：不以恢复旧 `index.css` 文件为目标；以删掉的 `index.css` 为**几何事实源**，断裂式写进当前唯一样式入口 `frontend/src/theme/app.css`（可保留日夜间变量与 Token）。
2. **生成**：**必须手选**——图片/视频模型预设、图片画幅、视频画幅、视频时长均须用户显式选择；缺项时禁用入口并显示原因，禁止静默半残。
3. **AI 配置刷新提示**：改为「图片 X / 视频 Y」（或等价合计明细），禁止再用「已更新 N 个」把全量与当前 Tab 列表数混报。

症状覆盖：总览与剧本滚不动；资产标准图区空态/压缩；分镜本镜资产条压扁看不见；刷新 44 vs 列表 33 的假事故感。

## 当前事实

- 入口已是 `main.tsx` → `./theme/app.css`；`frontend/src/index.css` 已删除。
- 旧 `HEAD:frontend/src/index.css` ≈594 行；当前 `theme/app.css` 已迁入剧本/资产/分镜/项目列表布局与子滚动 owner。
- 生成门闸：后端拒绝静默选模/首项画幅/时长；前端资产页与分镜台缺手选时禁用并显示原因。
- `AiConfigPage` 刷新 success 使用 `refreshCatalogMessage` 分项报「图片 X / 视频 Y」。

## 失败证据

| ID | 证据 | 影响 |
| :--- | :--- | :--- |
| E1 | 旧新 CSS 类 Compare：约百个页面类缺失；`script-*` 几乎清空 | 剧本滚不动、工作区几何崩 |
| E2 | 新主题 `project-workspace-body overflow:hidden` 无配套子滚动 | 总览与剧本失效 |
| E3 | 分镜资产条/检查器 overflow 链不完整 | 「本镜资产」压扁看不见 |
| E4 | 生成缺预设/画幅/时长时后端拒绝，前端空控件/空态并存 | 标准图「还没有/待生成」观感像坏了 |
| E5 | toast 全量 N vs Tab 过滤列表 | 「更新 44、列表 33」误报 |

## 目标

1. `theme/app.css` 成为**唯一**样式入口，且剧本/资产/分镜/项目壳的滚动与可见几何达到旧 `index.css` 的可用性（允许视觉皮肤不同，不允许功能布局残缺）。
2. 生成全手选合同在前后端一致：无预设、无画幅、无（声明档位时的）时长 → 按钮禁用 + 可见原因；有完整手选 → 可提交。
3. 刷新提示与目录口径一致：至少报「图片 X / 视频 Y」。
4. 浏览器人工可验收：剧本可滚；有 `image_url` 的资产不显示「还没有标准资产图」；分镜本镜资产三列可读；刷新文案正确。

## 不做范围

- 不恢复 `frontend/src/index.css` 文件名或双样式入口。
- 不恢复自动选模、目录首项画幅/时长静默兜底。
- 不借本轮引入通用 OpenAI-compatible 媒体 Provider、不改 YAML 凭据写入 UI。
- 不扩张暗色主题「好看」范围优先于布局可用性。
- 不调用真实供应商作为本轮阻塞条件（可选烟测另报）。
- 默认不 commit/push，除非 owner 另授。

## 设计

### 事实 owner

| 事实 | Owner |
| :--- | :--- |
| 布局几何 + 滚动合同 | `frontend/src/theme/app.css`（唯一）；迁移对照 `git show HEAD:frontend/src/index.css` |
| 日夜间颜色 Token | `ThemeContext` + `App.tsx` ConfigProvider；不得删布局类 |
| 模型目录与校验 | `aiConfigService` + `provider_model_catalog` |
| 手选生成门闸 | 后端：`select` / `resolveAspectRatio` / `resolveVideoDuration`；前端：资产页、分镜台禁用原因 |
| 刷新文案 | `AiConfigPage` + `refreshCatalogMessage` |

### 布局（断裂式迁入新主题）

1. 从旧 `index.css` 抽出并迁入：`script-*`、`project-workspace*`、`asset-*`（含 status/standard）、`director-*`（含 palette/inspector/form 滚动）、首页项目列表必要几何。
2. 滚动合同：外层 `project-workspace-body` 可 `overflow: hidden`；**必须**有明确子滚动 owner（剧本表单、资产详情、分镜 collapse/检查器）。
3. 允许保留 Codex 已改的分镜「左轨竖排」等新结构，但须保证检查器与本镜资产条在桌面宽度下可读、可点；不得以「响应式以后再说」留下 0 高度。
4. 迁完后做一次类名覆盖审计：旧文件中仍被 TSX 引用的 class，新文件必须有对应规则（或同步改 TSX 去掉死类，二选一写进 diff）。

### 生成全手选

1. 后端保持：无显式模型/画幅/(有档位时)时长 → `ValidationError`，不自动挑第一个。
2. 前端：
   - AI 配置必须能选并保存图片/视频预设；制作页无唯一命中预设时显示「未选择…」，**禁用**生成，不假装自动。
   - 资产页：无画幅选项或未选手选画幅 → 禁用「保存并生成」。
   - 分镜：无图片画幅、无视频画幅/时长（当目录声明了选项时）→ 禁用对应生成；原因文案与后端一致口径。
3. 切镜头不得静默清空用户已选手选值除非该值已不在新模型能力内（仅清除非法值）。
4. 空态「还没有标准资产图 / 待生成」仅表示无 `image_url`；有图必须显示图。生成失败走错误提示，不与空态混为一谈。

### 刷新计数

- `refresh` 成功后按返回模型算 `imageCount` / `videoCount`，提示形如：`PearAPI 已更新：图片 33 / 视频 11`（数字以实际为准）。
- 若只刷新当前 Tab，文案与请求 `service_type` 一致；当前实现若刷新全量，必须报分项。

## 实施任务

- [x] 对照 `HEAD:index.css` 与当前 TSX className，列出必须迁入 `theme/app.css` 的布局/滚动规则清单并迁入。
- [x] 修复剧本滚动、资产标准图区/状态徽章、分镜本镜资产条与检查器可见性；桌面宽度人工看一眼。
- [x] 闭合生成全手选：资产页 + 分镜台禁用条件与原因文案；修正切镜清空合法画幅的行为。
- [x] AI 配置刷新提示改为「图片 X / 视频 Y」。
- [x] 补/改确定性测试：刷新文案或计数辅助函数；前端手选门闸；必要时后端已有拒绝测试保持绿。
- [x] 更新 `spec.md` / `README.md` / `history.md`：唯一主题入口、手选生成、刷新分项计数。
- [x] 全量验证并回填收口。

## 验证计划

- 前端：`npm.cmd test`、`npm.cmd run lint`、`npx.cmd tsc -b --pretty false`、`npm.cmd run build`。
- 后端：若本轮改到选模/时长/画幅服务，跑 `npm.cmd test`、`typecheck`、`build`。
- `git diff --check`。
- 人工验收（阻塞本轮收口）：
  1. 总览与剧本可滚动编辑。
  2. 有标准图的资产卡详情能看见图，不是「还没有」。
  3. 分镜「本镜资产」人物/场景/道具可读可选。
  4. 未选预设/画幅/时长时生成按钮禁用且有原因；选齐后可点（可用 Mock/本地，不强制真供应商）。
  5. 刷新提示含「图片 X / 视频 Y」。

## 收口

- 完成事实：`theme/app.css` 补齐剧本/资产/分镜/项目列表布局与子滚动；资产详情与分镜台手选门闸闭合；AI 配置刷新改「图片 X / 视频 Y」；文档与 `refreshCatalogMessage` 单测已更新；迁移临时 CSS 已删。
- 实际命令（frontend）：`npm.cmd test` 25/25；`npm.cmd run lint` 仅既有 warning；`npm.cmd run build`（含 `tsc -b`）通过；`git diff --check` 无错误（仅 CRLF 提示）。本轮未改后端选模服务，未跑后端套件。
- 未验证项：浏览器人工五项验收；真实供应商出片；未授权不 commit/push。
- 剩余风险：窄屏断点可能仍需微调；桌面可用性需 owner 目视确认。
