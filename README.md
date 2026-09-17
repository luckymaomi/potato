# mini-video

本地 AI 生成工作台：在一个 React Flow 画布里编排提示词、图片、视频和短剧资源。

## 当前能力

- React 18 + TypeScript + Vite 前端
- 项目列表：新建、打开、导入 ZIP、导出 ZIP
- AI 配置：从根配置读取 Agnes/PearAPI，页面查看状态并同步实时模型目录
- 画布节点：文本、图片、视频，以及角色、场景、道具、分镜变体
- 节点拖动、缩放、平移、框选、多选和自由连线
- 文生图、图生图、文生视频、图生视频
- 角色/场景/道具参考图生成，文本节点手动或选配 AI
- 分镜生成、分镜图生成、按连线依赖整组运行
- 画布内提交整集合成
- Agnes 完整 Demo：直接运行真实剧本、实体、参考图、分镜图和视频链路，不使用假成功结果

后端 `backend` 是本项目的独立服务端目录，接口前缀为 `/api/v1`；前端和后端均以 `mini-video` 为项目名。

## 快速开始

先启动后端：

```powershell
cd backend
npm.cmd install
npm.cmd run migrate
npm.cmd run dev
```

另开终端启动前端：

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

后端也可以先构建再运行 `npm.cmd run build`、`npm.cmd run start:dist`。供应商采用统一核心合同 + 独立适配器设计，当前只注册 Agnes 与 PearAPI，两者都按实时目录声明文本、图片和视频能力；新增供应商时增加独立适配器并注册，不修改文本、图片或视频业务服务。没有真实凭据时不会把请求桩或模板占位内容当成生成成功。

首次运行先复制根配置并填写所需供应商的 `api_key`：

```powershell
Copy-Item config.example.yaml config.yaml
```

模型来自供应商实时目录。节点可以自行选模型；需要统一默认值时，可在对应供应商下配置可选的 `default_models.text/image/video`，其值必须来自实时目录。`config.yaml` 已被 Git 忽略，不要提交或分享。

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
