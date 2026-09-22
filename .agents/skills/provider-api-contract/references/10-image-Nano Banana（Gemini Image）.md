# PearAPI 生图专栏 · Nano Banana（Gemini Image）

对应官方：`生图生视频API/PearAPI/图片/Nano Banana（Gemini Image）.txt`  
公共传输、请求字段、本仓 async/url 策略见 `00-general-contract.md`。

## 定位

Google Gemini 原生多模态图像模型（Nano Banana 系列）。官方描述支持强图文理解与图像生成 / 编辑。

## 模型 id 来源

- **权威 id**：PearAPI `GET /v1/models`（如 `nano-banana-2-1k`、`nano-banana-2-2k`）。
- **静态专栏**：可能只写到 `2` / `2-4k` / `lite`；目录清晰度档按同族补洞。

## 本专栏能力（同族继承）

| 族 / 示例 model_id | 画幅（aspect_ratio） | 参考图上限 |
| :--- | :--- | ---: |
| `nano-banana-pro`、`nano-banana-pro-4k` | 9:16，16:9，1:1，2:3，3:2，3:4，4:3，4:5，5:4，21:9，1:4，4:1，1:8，8:1 | ≤ 14 |
| `nano-banana-2`、`nano-banana-2-1k`、`nano-banana-2-2k`、`nano-banana-2-4k`、`nano-banana-2-lite` | 同上（14 种） | ≤ 14 |
| `nano-banana` | 9:16，16:9，1:1，2:3，3:2，3:4，4:3，4:5，5:4，21:9 | ≤ 6 |

模式：文生图与图生图均支持。

## 接口（本专栏）

| 操作 | 方法路径 | 说明 |
| :--- | :--- | :--- |
| 生成 | `POST /v1/images/generations` | `model` 换成本表任一 id |
| 编辑 | `POST /v1/images/edits` | 字段与生成一致，**必须**至少传 `image` 或 `images` |
| 查任务 | `GET /v1/images/tasks/{id}` | 异步轮询 |

## 本仓适配器状态

- 落点：`backend/src/providers/adapters/pearApi.ts` → `isNanoBananaFamilyId` / `knownModelMetadata`
- 匹配：`nano-banana` | `nano-banana-pro[-1k|2k|4k]` | `nano-banana-2[-1k|2k|4k|lite]`
- 分支：
  - 基础 `nano-banana`：`reference_image = 6`，10 种画幅
  - 其余 Pro / 2 族清晰度档：`reference_image = 14`，14 种画幅
- `source`：一律 `adapter-override`
- 测试：`backend/test/dynamicModels.test.ts` 含 `2-1k` / `2-2k`

## 维护注意

- **不要**把基础 `nano-banana` 的 6 张 / 10 画幅套到 Pro / 2 族。
- 超宽 / 超高画幅（`1:4`、`4:1`、`1:8`、`8:1`）只属于非基础族。
- `2-1k` / `2-2k` 是目录正式清晰度档，不是脏 id。
