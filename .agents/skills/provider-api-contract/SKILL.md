---
name: provider-api-contract
description: "维护并验证 potato 的生图、生视频 Provider API 协议、模型能力目录与适配器映射；修改 Agnes/PearAPI 请求、模型能力或协议文档时使用。"
---

# Provider API 协议合同

用于把外部生图/生视频 API 文档转成可审查、可测试的 Provider 合同。它覆盖请求路径、鉴权、异步轮询、请求字段、模型能力、适配器补洞和真实验收边界，不负责前端视觉或通用业务流程。

## 工作规则

1. 先读 `references/00-general-contract.md`，再按任务读取 `references/10-image-contract.md` 或 `references/20-video-contract.md`。外部源文件删除后不作为运行时依赖；标准化文档不能替代仍可取得的源证据。
2. 能力按三层处理：供应商目录原始字段 -> 适配器已核验补洞 -> 业务服务通用校验。适配器补洞必须标记 `source: adapter-override`；未知字段保持 `null`/`unknown`，不得从通用 schema 示例猜测。
3. 业务层只消费 `ProviderModelCapabilities`，不得按 provider 名称或模型 ID 分支。协议字段差异只在对应 adapter 内处理。
4. PearAPI 图片使用 `/v1/images/generations`，异步任务轮询 `/v1/images/tasks/{id}`；视频使用 `/v1/video/generations`，轮询 `/v1/video/generations/{task_id}`。所有请求使用 Bearer Token，并保留供应商错误 envelope。
5. Grok Imagine Video 1.5 专栏是特例：使用 `mode`、`seconds`、`aspect_ratio`、`images`，不要因为通用视频 schema 存在 `duration` 或 `reference_contents` 就发送这些字段。按次计费和固定时长档位是两个独立能力。
6. 每次协议变更至少增加目录能力测试和请求体映射测试；涉及拒绝规则时增加非法参考图数、画幅或时长的确定性测试。HTTP 200、Mock 任务 ID 或测试绿灯不能证明真实出片成功。

## 参考文档路由

- PearAPI 图片模型和字段：读 `references/10-image-contract.md`。
- PearAPI Grok 视频：读 `references/20-video-contract.md`，并核对供应商专栏字段。
- Agnes：以仓库现有 Agnes 适配器和真实协议证据为准；PearAPI 文档不能推导 Agnes 能力。

## 变更与验收

- 先建立失败证据或缺口测试，再修改 adapter/contract；同步更新 `plan.md`、`spec.md` 或 `history.md` 的事实 owner。
- 能力目录变更要覆盖模型 ID、模式、参考图上限、画幅、视频时长档位和计费模式；`billingMode` 不得被 `supportedDurations` 自动推断覆盖已明确的按次声明。
- 完成后运行后端 `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`，必要时运行前端测试/typecheck/build，并执行 `git diff --check`。
- 真实供应商调用需要 owner 授权和脱敏证据；未授权时停在确定性测试，不伪造“真实出片成功”。
