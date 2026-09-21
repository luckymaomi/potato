# 通用媒体 Provider 合同

业务服务只消费 `ProviderModelCapabilities`，适配器负责供应商字段映射；未知能力保持 `null`，禁止从示例猜测。

## 能力字段

- `modes`：文生图、图生图、文生视频、图生视频。
- `maxReferenceImages`：辅助参考图上限；视频首帧另计。
- `aspectRatios`：已验证画幅集合；未知为 `null`。
- `supportedDurations`：已验证时长档位；未知为 `null`。
- `billingMode`：`duration`、`per-request` 或 `unknown`，不等同于是否接受时长参数。
- `source`：目录原始声明或适配器补洞，必须可审计。

生成请求必须显式给出模型、画幅，以及模型声明需要的时长；缺少时后端拒绝，不能取第一项或供应商默认值。自动选模只允许用于目录浏览，不能进入生成执行链路。

提交成功只代表供应商接受任务；必须轮询并以最终媒体归档完成作为业务成功。错误 envelope 保留结构化状态和原因。
