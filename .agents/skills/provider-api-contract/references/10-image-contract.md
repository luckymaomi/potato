# 生图专用合同

PearAPI 使用 `POST /v1/images/generations`，Bearer 鉴权，项目固定发送 `response_format=url` 与 `task_type=async`，使用 `GET /v1/images/tasks/{id}` 轮询。

已核验能力：GPT Image 2、2K、4K 为最多 16 张参考图和 13 种画幅；GPT Image 1.5 为最多 16 张及 `9:16/16:9/1:1`；Nano Banana Pro、Pro-4K、2、2-4K、2-Lite 为最多 14 张和 14 种画幅；基础 Nano Banana 为最多 6 张和 10 种画幅。

上述补洞只在 PearAPI 适配器登记 `adapter-override`，不得外推到未知模型。
