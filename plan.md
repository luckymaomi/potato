# 当前任务：全局职责审查与可选拆分合同

> **纪律**：单一职责按**变化原因**判断，不按行数机械拆分。禁止为拆而拆。

## 需求

对超 ~300 行源文件做职责审查；按语义拆分真混杂；清理退场残留；不恢复页组装 / TTS。

## 当前事实（实施后）

- `AssetRepository` 门面仍挂 `services.assets`；内部拆为：
  - `projectAssetRepository.ts`：资产卡 CRUD + profile/output 规范化
  - `panelRepository.ts`：分镜 CRUD + 配方失效 / 标脏
  - `workspaceNormalize.ts`：共用 normalize 小工具
- `projectService.get()` 复用 `hydratePanelRow` / `hydrateProjectAsset`，去掉双写 hydrate。
- 分镜台展示抽到 `frontend/.../panels/`；`StoryboardWorkspace.tsx` 只保留编排（约 500 行）。
- `app.css`：存活 `director-*` 改 `panel-*`；删无引用死规则。
- **未拆**：`workspaceRoutes`、`imageGenerationService`、`aiConfigService`、`agnes`（视频合同未再动）。

## 失败测试或失败证据

无失败驱动；owner 授权「开拆」后实施。定向测全绿。

## 目标

- [x] 资产 vs 分镜仓储按变化原因分离  
- [x] 分镜台展示与编排分离  
- [x] CSS 退场清理  
- [x] project hydrate 复用  
- [x] 定向验证  

## 不做范围

- 不拆 routes / 生图服务 / 机械拆 CSS modules  
- 不拆 agnes 图视频（本轮无视频合同变更）  
- 不恢复 compose / TTS  

## 设计

见已落地文件边界；门面保留对外 API，避免全仓改调用点。

## 实施任务

- [x] 调查分类  
- [x] `assetRepository` → projectAssets + panels + normalize  
- [x] `projectService` hydrate 复用  
- [x] `StoryboardWorkspace` 抽 `panels/*`  
- [x] `app.css` 清 `director-*`  
- [x] 定向测 + typecheck  
- [ ] commit / push（另授权）

## 验证计划

- 后端：`assetRepository` / `coreServices` / `storyboardPromptAssembler` / `orphanImageGeneration` + `tsc`  
- 前端：`tsc`  
- 人工点通：未做  

## 收口

- 完成事实：仓储语义拆分 + 分镜 UI 抽文件 + CSS 清理 + hydrate 复用。  
- 实际命令：上述定向测 22 通过；前后端 `tsc --noEmit` 通过。  
- 未验证项：浏览器人工；agnes 未动。  
- 剩余风险：门面仍偏厚，但变化原因已分文件。  
- commit / push：未授权，未提交。
