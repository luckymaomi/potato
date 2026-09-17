# Provider 边界

Provider 层只有一个核心合同，当前接入 Agnes 与 PearAPI 两个适配器。

## 职责

- `contracts.ts`：文本、图片、视频的标准输入、能力与结果。
- `registry.ts`：按明确的 Provider ID 查找适配器；未知 ID 必须拒绝。
- `runtime.ts`：能力校验、标准状态和轮询控制。
- `transport.ts`：HTTP、超时、JSON 与网络错误归一化。
- `adapters/agnes.ts`、`adapters/pearApi.ts`：供应商专属协议。

业务服务不能读取供应商响应字段，也不能按供应商名称分支。适配器不能持久化项目或生成记录。

## 新增供应商

1. 在 `adapters/` 新建一个适配器，实现真实支持的能力。
2. 在 `index.ts` 注册工厂。
3. 增加请求体、响应、错误、异步轮询和能力拒绝测试。
4. 配置页会从 `GET /api/v1/ai-configs/providers` 发现新供应商。

当前不支持自定义兼容线路，也不根据 URL、模型名或协议字符串猜测供应商。
