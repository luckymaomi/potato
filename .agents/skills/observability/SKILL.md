---
name: observability
description: 修改 tomato-ai-drama 的 Everything JSONL 日志、审计事件、结构化失败或运行诊断信息时使用；不把普通 UI 文案变化路由到本 Skill。
---

# Observability

## 日志合同

- 默认持久日志为 `backend/logs/everything.log`，独立于 `backend/data` 生命周期。
- HTTP、项目/剧集/画布 CRUD、生产命令、任务、Provider、归档、合成、Demo 初始化和验收入口使用稳定事件名。
- 每条记录包含时间、级别、事件和足够定位的结构化上下文；跨异步链优先保留 run、task、project、node 和 generation 标识。

## 安全与真实性

- Key、Authorization、token、secret、查询串、Data URL、Buffer、循环对象和超长值在唯一日志入口统一脱敏。
- 阶段与百分比分开记录；没有上游真实百分比时不推算。失败保留实际阶段、错误码、供应商和可重试性。
- 日志用于取证，不能代替数据库状态、磁盘文件或真实外部结果。

## 验证

- 测试代表性 CRUD、任务成功/失败、Provider 失败和归档事件，并证明敏感字段不会写入磁盘。
- 调查崩溃时按首个异常和组件栈排序，不把后续连锁警告误判为根因。
