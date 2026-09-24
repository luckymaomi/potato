<div align="center">

# 土豆漫画

### AI 漫画工作流

人工剧本 → 项目资产卡与标准资产图 → 分格台底板

[当前产品事实](spec.md) · [协作规约](AGENTS.md) · [GitHub](https://github.com/luckymaomi/potato)

<p>
  <a href="https://github.com/luckymaomi/potato"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-potato-111827?logo=github"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20.9-339933">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6">
  <img alt="React" src="https://img.shields.io/badge/React-18-149ECA?logo=react">
</p>
</div>

土豆漫画把短剧素材收成一条可执行漫画工作流：先写清故事与剧本，再建可复用的项目资产卡并产出标准资产图，在分格台逐格组装并归档底板。

项目之间相互隔离。同一项目内的角色卡、场景卡、道具卡可按 ID 跨话复用。故事、剧本、资产卡与分格规格由用户编辑与保存；生成只消费已保存的最终文本与引用快照。

## 当前能力

| 阶段 | 做什么 |
| --- | --- |
| **总览与剧本** | 编辑项目钩子、世界观、主线与本话结构、场次节拍和剧本文本 |
| **项目资产库** | 建角色 / 场景 / 道具卡，组装或手写产出提示词，逐张生成或上传标准资产图 |
| **分格台** | 填漫画格规格（节拍、动作定格、表情、取景、构图、视角、光线、氛围），选本格资产与额外参考图，组装并保存图片配方，手选画幅后生成或上传单格底板，查看历史和待复核 |

- **双通道**：分格组装使用资产卡结构化文本与标准图；资产图生成使用用户保存的产出提示词与输入参考图。预设切换与页面刷新不会覆盖已保存的最终文本。
- **手选生成**：在 AI 配置页保存图片模型预设；在分格台选择画幅。缺项时入口禁用并给出原因。
- **媒体与归档**：任务提交后返回本地任务 ID 并轮询；成功媒体归档后，业务对象指向已完成且可用的 generation。
- **主题**：前端样式入口为 `frontend/src/theme/app.css`，支持日间 / 夜间。

供应商为 Agnes 与 PearAPI。凭据读取仓库根目录私有 `config.yaml`。

## 快速开始

需要 Node.js **20.9+**。

```powershell
# 终端 1：后端
cd backend
npm.cmd install
npm.cmd run dev

# 终端 2：前端
cd frontend
npm.cmd install
npm.cmd run dev
```

- 前端：http://localhost:3012
- 后端：http://localhost:5679
- 前端通过 `/api` 与 `/static` 代理到后端

配置 `config.yaml` 后，打开「AI 配置」刷新模型目录，选择图片默认预设，再到分格台出底板。

### Demo 与清理

空库可写入《红女王》示例规格（不调用真实供应商）：

```powershell
python init_demo.py
```

清理数据库与归档媒体：

```powershell
python clear_database.py
```

出片前请在 AI 配置页设好可用模型。

### 常用验证

```powershell
cd backend
npm.cmd run typecheck
npm.cmd test
npm.cmd run build

cd ../frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

## 继续了解

- [当前产品事实与验收合同](spec.md)
- [Agent 协作与交付纪律](AGENTS.md)
- [变更与取舍记录](history.md)

分格门闸与模型能力规则见 `spec.md`。
