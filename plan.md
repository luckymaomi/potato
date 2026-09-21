# 本轮合同：分镜标脏与生成就绪门闸

## 需求与目标

为分镜持久化图片、视频和配方的复核状态。上游资产、镜头规格、出场资产、额外参考图或首帧变更时，明确标记受影响镜头；用户可以按镜确认或单镜重跑。所有媒体生成和整集合成在后端执行权威就绪检查，前端基于后端返回的同一事实展示禁用原因或失败原因，不在前端复制配方规则。

## 当前事实与失败证据

- `storyboards` 当前保存配方、引用快照、分镜图和视频指针，但未发现图片/视频待复核或配方待重装字段。
- 资产文本、资产标准图、镜头规格及镜头引用的变更路径尚未声明向下游传播复核状态。
- 现有入口已要求资产产出提示词、图片配方、分镜图和视频配方，以及合成前每镜都有视频；尚未覆盖角色/场景标准图、空出场、过期配方、视频污染词和待复核视频。
- 本轮先建立契约测试。实现前的失败将记录为测试输出；不能把当前说明或 HTTP 成功当作行为证据。

## 事实 owner 与设计

- `backend/src/db/schema.ts`：复核状态字段的唯一持久化定义。
- `backend/src/services/assetRepository.ts` 与分镜持久化服务：资产、镜头和当前媒体指针改变时，按资产 ID 或镜头 ID 传播/清除状态；历史 generation 不删除。
- `backend/src/routes/workspaceRoutes.ts`：生成与合成的权威就绪检查、确认通过接口以及可供前端消费的状态。
- 一个小型后端纯函数集中识别视频配方中的九宫格、分屏、多宫格等污染词，并由单元测试锁定。
- `frontend/src/features/workspace/StoryboardWorkspace.tsx`：显示图片待复核、视频待复核、配方待重装；用后端就绪结果禁用按钮并显示原因；提供按镜确认图片/视频操作，不添加整集强制重跑。
- `frontend/src/pages/ProjectsPage.tsx`：项目卡整体点击进入；移除封面播放视觉和“打开总览”按钮；新建集只创建并留在项目首页，由用户显式点击剧集进入工作区。
- 项目 ZIP 格式升级并对新字段做往返测试；空库直接按新 schema 创建，不兼容旧 ZIP。
- `storyboardPromptAssembler.ts` 和 `assetOutputPromptAssembler.ts` 保持配方拼接顺序不变；生成只读已保存配方。

## 不做范围

- 不修改 `reference/`、过期 canvas/DAG skill 文案、AI 写剧、批量出图、节点画布主路径或配音/字幕/BGM/精剪。
- 不做真实供应商调用、不提交、不推送，也不为不存在的生产数据或旧 ZIP 做兼容迁移。
- 不在打开页面、编辑字段或生成提交时自动组装配方。

## 任务

- [x] 调研真实调用链、领域类型、ZIP 读写和现有测试夹具。
- [x] 先新增失败契约测试：资产标准图标脏、出场资产改动导致配方过期与拒绝、分镜图变更标脏视频、缺角色标准图、视频污染词、待复核视频阻断合成，以及 ZIP 往返。
- [x] 实现 schema、仓储/服务传播、路由门闸和确认接口。
- [x] 实现分镜台的状态、禁用原因与按镜确认操作。
- [x] 调整项目首页的项目卡进入与新建集留页交互，不改变项目/剧集数据合同。
- [x] 更新 `spec.md`、`README.md` 和 `history.md`，回填本合同。

## 验证

- 后端：`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`。
- 前端：`npm.cmd test`、`npm.cmd run lint`、`npx.cmd tsc -b --pretty false`、`npm.cmd run build`。
- 除自动测试外，不执行真实供应商调用；浏览器人工审美不作为本轮阻塞条件。

## 收口

- [x] 实现与测试完成后回填实际命令结果、未验证项、剩余风险、commit/push 状态。

已完成：`storyboards` 新增三项持久化复核状态；资产/镜头/首帧变更、媒体选用和清除会按合同传播状态，保留历史 generation。图片、视频、合成入口的权威检查与 `GET /storyboards/:id/readiness` 已落地；前端仅消费该结果来禁用按钮、展示原因和风险提示。项目 ZIP 已升为 `format: 8` 并往返复核状态。项目首页项目卡整体进入、移除封面播放图和“打开总览”，新建集保持在首页。

实际验证：后端 `npm.cmd test` 73/73 通过，`npm.cmd run typecheck` 通过，`npm.cmd run build` 通过；前端 `npm.cmd test` 23/23 通过，`npm.cmd run lint` 退出码 0（6 条既有 warning）。`npx.cmd tsc -b --pretty false` 与 `npm.cmd run build` 均被 owner 已有的 `frontend/src/features/workspace/ProjectShell.tsx` 三个未使用变量阻断，未修改该无关文件。`git diff --check` 通过。

未验证：未调用真实供应商；未进行浏览器人工审美验收。开发服务启动命令被当前运行策略拒绝，未能提供本地预览 URL。剩余风险：不存在资产标准图“清除当前图”的公开入口；未来若添加，必须调用同一资产标脏方法。未执行 commit 或 push。
