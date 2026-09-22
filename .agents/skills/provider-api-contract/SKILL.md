---
name: provider-api-contract
description: "维护并验证 potato 的 PearAPI/Agnes 生图 Provider API 协议、模型能力目录与适配器映射；修改 GPT Image、Nano Banana、Grok 生图请求或能力补洞时使用。"
---

# Provider API 协议合同（生图）

把外部 **PearAPI 生图** 官方专栏转成可审查、可测试的仓库合同。覆盖路径、鉴权、异步轮询、请求字段、模型能力、`adapter-override` 与真实验收边界。不负责前端视觉或通用业务编排。

本 Skill 的 `references/` **只含生图**。生视频不在此目录维护。

## 工作规则

1. 先读 `references/00-general-contract.md`（公共传输 + 本仓策略），再按模型族读对应专栏：
   - GPT Image → `references/10-image-GPT Image.md`
   - Nano Banana（Gemini Image） → `references/10-image-Nano Banana（Gemini Image）.md`
   - Grok（xAI）生图 → `references/10-image-Grok（xAI）.md`
2. 外部桌面源文件（`生图生视频API/PearAPI/图片/`）删除后不作为运行时依赖；以本目录合同为准。标准化文档不能替代仍可取得的源证据。
3. 能力三层：供应商目录原始字段 → 适配器已核验补洞（`source: adapter-override`）→ 业务通用校验。未知保持 `null`/`unknown`，禁止从示例或其它专栏猜测。`/v1/models` 返回的正式 id（含 `2.5`、`-2-2k` 等清晰度档）以目录为准；静态专栏滞后时按同族能力补洞，不得把目录 id 当成脏数据丢掉。
4. 业务层只消费 `ProviderModelCapabilities`，不得按 provider 名或 model id 分支。协议差异只在适配器内处理。
5. PearAPI 生图：`POST /v1/images/generations`（及官方 `edits`）、异步 `GET /v1/images/tasks/{id}`，Bearer 鉴权。本仓固定 `response_format=url` 与 `task_type=async`（见通用合同）。
6. 每次能力变更至少增加目录能力测试；涉及拒绝规则时覆盖非法参考图数或画幅。HTTP 200、Mock task id、测试绿灯不能证明真实出片与本地归档完成。

## 参考文档路由

| 需求 | 读 |
| :--- | :--- |
| 公共路径 / 字段 / 本仓策略 | `references/00-general-contract.md` |
| GPT Image 模型表与补洞状态 | `references/10-image-GPT Image.md` |
| Nano Banana 模型表与补洞状态 | `references/10-image-Nano Banana（Gemini Image）.md` |
| Grok 生图模型表与缺口 | `references/10-image-Grok（xAI）.md` |
| Agnes | 以仓库 Agnes 适配器与真实协议证据为准；不得用 PearAPI 图片专栏推导 Agnes |

## 变更与验收

- 先建立缺口或失败测试，再改 `pearApi.ts` 与合同；需要时同步 `history.md` / `spec.md`。
- 能力目录变更覆盖：model id、modes、`maxReferenceImages`、`aspectRatios`、`source`。
- 跑后端 `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`；必要时前端测试/build；`git diff --check`。
- 真实供应商调用需 owner 授权与脱敏证据；未授权停在确定性测试。
