# tomato-ai-drama 后端

Node.js、Express、SQLite 后端，默认监听 `5679`，API 前缀为 `/api/v1`。源码、测试和构建使用严格 TypeScript。

## 运行与验证

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Node.js 要求 20.9 或更高版本。数据库结构由 `src/db/schema.ts` 在空数据目录直接建立，当前开发阶段不提供旧结构迁移。

## 模块

- `src/routes/`：HTTP 输入、输出和状态码。
- `src/services/`：项目、剧集、资产产出、分镜、图片、视频、任务和整集合成。
- `src/providers/`：供应商合同、能力目录、轮询和适配器。
- `src/db/`：SQLite 连接和当前结构。

工作区 API 包含人工总览与剧本、项目级角色/场景/道具资产卡、分镜、单镜图片/视频生成和整集合成。项目总览分别保存核心钩子、世界观、主线、基调和参考设定；剧集分别保存本集目标、冲突、转折、结尾钩子、场次节拍和人工剧本文本。资产提示词与分镜双配方都只由显式组装接口编译；组装结果由用户查看、编辑并保存。资产、分镜图片和分镜视频生成分别直接使用已保存的最终提示词及对应图片引用，不在提交生成时重新组装。健康检查为 `GET /health`，任务状态为 `GET /api/v1/tasks/:id`，取消任务为 `POST /api/v1/tasks/:id/cancel`。数据与归档合同见根目录 `spec.md`。

图片和视频供应商调用是异步协议。提交取得任务号后持续轮询明确终态；本地任务先返回任务 ID。图片可按已满足依赖并发，视频任务串行。首次提交不因网络抖动盲目重发。

供应商凭据只读取根目录私有 `config.yaml`。当前注册 Agnes 与 PearAPI，后端只维护图片与视频模型目录和预设。
