# PearAPI 生图专栏 · GPT Image

对应官方：`生图生视频API/PearAPI/图片/GPT Image.txt`  
公共传输、请求字段、本仓 async/url 策略见 `00-general-contract.md`。

## 定位

OpenAI GPT Image 系列文生图 / 图生图，支持高清 2K / 4K 输出。

## 模型 id 来源

- **权威 id**：PearAPI `GET /v1/models` 返回的正式 `model` 字符串（如 `gpt-image-2.5-2k`）。
- **静态专栏**：可能滞后；未逐条列出的同族清晰度档仍按族能力补洞。

## 本专栏能力（同族继承）

| 族 / 示例 model_id | 画幅（aspect_ratio） | 参考图上限 |
| :--- | :--- | ---: |
| `gpt-image-2`、`gpt-image-2-2k`、`gpt-image-2-4k` | 9:16，16:9，1:1，3:2，2:3，4:3，3:4，5:4，4:5，2:1，1:2，21:9，9:21 | ≤ 16 |
| `gpt-image-2.5`、`gpt-image-2.5-2k`、`gpt-image-2.5-4k`（目录正式 id） | 同上（13 种） | ≤ 16 |
| `gpt-image-1.5` | 9:16，16:9，1:1 | ≤ 16 |

模式：文生图与图生图均支持（目录补洞登记 `text2image` + `image2image`）。

## 接口（本专栏）

| 操作 | 方法路径 | 说明 |
| :--- | :--- | :--- |
| 生成 | `POST /v1/images/generations` | `model` 换成本表任一 id |
| 编辑 | `POST /v1/images/edits` | 字段与生成一致，**必须**至少传 `image` 或 `images` |
| 查任务 | `GET /v1/images/tasks/{id}` | `task_type=async` 时轮询 |

图生图示例字段：`model` + `prompt` + `image`（或 `images`）+ `aspect_ratio`。

## 本仓适配器状态

- 落点：`backend/src/providers/adapters/pearApi.ts` → `isGptImage2FamilyId` / `knownModelMetadata`
- 匹配：`gpt-image-2(?:\.\d+)?(?:-(?:1k|2k|4k))?`，以及单独的 `gpt-image-1.5`
- `source`：一律 `adapter-override`
- 测试：`backend/test/dynamicModels.test.ts` 覆盖 2 / 2.5 清晰度档

## 维护注意

- 2 / 2.5 及 1k/2k/4k 清晰度档共享同一套参考图上限与 13 种画幅；`gpt-image-1.5` 仍是 3 种画幅。
- 新版本小数点（如 `2.5`）属于目录正式 id，不是「偶发脏数据」。
