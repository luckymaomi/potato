# PearAPI 生图专栏 · Grok（xAI）

对应官方：`生图生视频API/PearAPI/图片/Grok（xAI）.txt`  
公共传输、请求字段、本仓 async/url 策略见 `00-general-contract.md`。

## 定位

xAI Grok **图像**模型。

**不要**与 Grok Imagine **Video**（`grok-imagine-video-1.5` 等）混淆。视频不在本 Skill `references/` 维护；本文件只谈生图。

## 模型 id 来源

- **权威 id**：PearAPI `GET /v1/models` 返回的正式字符串，例如 `grok-imagine-image-2`、`grok-imagine-image-2-2k`。
- **静态专栏**：可能只写统一名 `grok-imagine-image`；目录变体与清晰度档按同族能力补洞。
- **旧别名**（官方描述）：`grok-3-image`、`grok-4-image`。

## 本专栏能力（同族继承）

| 示例 model_id | 画幅（aspect_ratio） | 参考图上限 |
| :--- | :--- | ---: |
| `grok-imagine-image` | 1:1，16:9，9:16，4:3，3:4，3:2，2:3，2:1，1:2，19.5:9，9:19.5，20:9，9:20 | ≤ 4 |
| `grok-imagine-image-2`、`grok-imagine-image-2-2k`（目录正式 id） | 同上（13 种） | ≤ 4 |
| `grok-3-image`、`grok-4-image` | 同上 | ≤ 4 |

模式：官方示例含文生图与图生图（`image` 字段）。

## 接口（本专栏）

| 操作 | 方法路径 | 说明 |
| :--- | :--- | :--- |
| 生成 | `POST /v1/images/generations` | `model` 用目录返回的正式 id |
| 编辑 | `POST /v1/images/edits` | 字段与生成一致，**必须**至少传 `image` 或 `images` |
| 查任务 | `GET /v1/images/tasks/{id}` | 异步轮询 |

请求体与 GPT / Nano Banana 专栏同属官方 `ImageGenerationRequest`；差异主要在 **model_id、画幅集合、参考图上限**。

## 本仓适配器状态（已落地）

| 项 | 状态 |
| :--- | :--- |
| `pearApi.ts` `knownModelMetadata` | modes 文/图生图，`reference_image: 4`，上表 13 种画幅 |
| `isGrokImagineImageId` | `grok-imagine-image[-n][-1k\|2k\|4k]` + `grok-3-image` / `grok-4-image` |
| `source` | `adapter-override` |
| `dynamicModels.test.ts` | 含 `grok-imagine-image-2`、`grok-imagine-image-2-2k` |
| 请求体 | 与通用 Pear 生图相同（`image` / `images` + `aspect_ratio` + async url），无视频字段 |

## 维护注意

- 参考图上限是 **4**，不是 GPT 的 16，也不是 Nano Banana Pro 的 14。
- 画幅含 `19.5:9` / `9:19.5` / `20:9` / `9:20`；不得用 GPT 的 13 种表替换。
- 生图走 `/v1/images/*`；禁止误用视频路径 `/v1/video/generations` 或视频字段 `mode`/`seconds`。
- 改匹配后需**重启后端**并刷新模型目录；UI「画幅未知」读的是 `listModels` 能力，不是纯前端文案。
