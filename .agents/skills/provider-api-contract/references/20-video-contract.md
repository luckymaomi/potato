# 生视频专用合同

PearAPI 视频提交使用 `POST /v1/video/generations`，轮询使用 `GET /v1/video/generations/{task_id}`。字段必须以模型专栏为准。

Grok Imagine Video 1.5 及 `-preview`：最多 1 张参考图，画幅 `16:9` 或 `9:16`，时长 `4/6/8/10/12/15` 秒，计费 `per-request`。请求字段必须是 `mode`、`seconds`、`aspect_ratio`、`images`，不能发送通用 `duration` 或 `reference_contents`。

“按次”只代表计费维度，不代表没有时长档位。时长和画幅都要求用户显式选择。Agnes 没有明确时长档位时不得伪造。
