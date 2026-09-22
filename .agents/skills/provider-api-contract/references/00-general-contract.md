# PearAPI 生图 · 通用合同

本 Skill 的 `references/` **只维护 PearAPI 生图**。官方专栏源文件在桌面
`生图生视频API/PearAPI/图片/`（GPT Image、Nano Banana（Gemini Image）、Grok（xAI））。
源文件不是运行时依赖；本目录合同才是仓库内可审查事实。

生视频合同不在本 Skill 的 `references/` 中维护。视频能力若仍存在于适配器代码，以代码与单独视频任务为准，不得从本目录图片专栏推导。

## 能力分层（必须遵守）

1. **供应商实时目录**（`/v1/models`）原始字段。
2. **适配器已核验补洞**（`source: adapter-override`），只允许登记本目录已写明的模型族。
3. **业务服务通用校验**（手选模型、手选画幅、参考图数量门闸）。

业务层只消费 `ProviderModelCapabilities`，不得按 provider 名或 model id 分支。协议字段差异只在 `backend/src/providers/adapters/pearApi.ts`（及 Agnes 适配器）内处理。未知能力保持 `null` / `unknown`，禁止从 schema 示例或其它专栏猜测。

## 能力字段含义

| 字段 | 含义 |
| :--- | :--- |
| `modes` | 生图侧：`text-to-image` / `image-to-image` |
| `maxReferenceImages` | 辅助参考图上限；超限必须拒绝，禁止静默丢图 |
| `aspectRatios` | 已验证画幅集合；未知为 `null`，禁止注入通用比例表 |
| `source` | `provider` 或 `adapter-override`，必须可审计 |
| `billingMode` / `supportedDurations` | 生图专栏通常不使用；勿用视频计费规则污染生图 |

生成请求必须显式给出模型与画幅；缺少时后端拒绝，不能取第一项或供应商默认值。

## PearAPI 生图公共传输（三专栏共用）

| 项 | 合同 |
| :--- | :--- |
| 鉴权 | `Authorization: Bearer <api_key>` |
| 创建/文生图·图生图 | `POST /v1/images/generations` |
| 编辑（官方另有专栏接口） | `POST /v1/images/edits`（须至少传 `image` 或 `images`） |
| 异步查询 | `GET /v1/images/tasks/{id}` |
| Base URL | 配置中的 PearAPI base；适配器会去掉尾部 `/v1` 再拼路径 |

### 请求体关键字段（官方 ImageGenerationRequest）

必填：`model`、`prompt`。

常用可选：

| 字段 | 说明 |
| :--- | :--- |
| `aspect_ratio` | **推荐**比例字段（如 `9:16`） |
| `size` | 像素或比例字符串；官方建议优先传比例 |
| `ratio` | 已废弃，兼容 `aspect_ratio` |
| `orientation` | `landscape` / `portrait` / `square`（兼容） |
| `image` | 单张参考图：URL / data URL / base64 |
| `images` | 多张参考图：string 或 string[] |
| `negative_prompt` | 负向提示（部分模型；GPT/Nano/Grok 专栏未强调必用） |
| `n` | 生成数量 1–4，默认 1 |
| `seed` | 随机种子（部分模型） |
| `response_format` | `url` \| `b64_json`，默认 `url` |
| `task_type` | `sync`（官方默认）\| `async` |

官方同步默认立即返回图；异步返回任务 ID，再查 `GET /v1/images/tasks/{id}`。

### 本仓 potato 固定策略（相对官方默认的差异）

写在适配器，不写在业务服务：

- 固定 `response_format=url`
- 固定 `task_type=async`（不跟官方默认 sync）
- 参考图：本地静态路径先经 `MediaReferenceService` 转 inline data URL；单张用 `image`，多张用 `images`
- 画幅：业务传入的 `aspectRatio` 映射到请求的 `aspect_ratio`（必要时同时带 `size`）
- 成功判定：供应商返回可下载 URL → 本地下载归档 → generation 落库；HTTP 200 / 仅 task id **不等于**业务完成

### 错误

保留供应商 error envelope（400/401/402/404/422/429/500 等）。不得把余额不足、限流等改写成模糊成功。

## 专栏索引（与官方文件夹命名对齐）

| 官方专栏名 | 本目录合同 |
| :--- | :--- |
| GPT Image | `10-image-GPT Image.md` |
| Nano Banana（Gemini Image） | `10-image-Nano Banana（Gemini Image）.md` |
| Grok（xAI） | `10-image-Grok（xAI）.md` |

维护时：官方文档更新 → 先改对应专栏合同 → 再改 `pearApi.ts` 的 `knownModelMetadata` / `isKnownModelOverride` → 再补 `backend/test/dynamicModels.test.ts`。
