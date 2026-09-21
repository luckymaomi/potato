---
name: canvas-ui
description: 修改 potato 的 React Flow 画布、节点选择、高亮、检查器、保存交互或渲染稳定性时使用；不负责生产命令和供应商协议。
---

# Canvas UI

## 事实 owner

- 原始图状态由 `frontend/src/store/canvasStore.ts` 拥有，React Flow 直接消费稳定的 `nodes/edges`。
- 节点和边类型在模块顶层注册；显示高亮由 `connectionHighlight.ts` 投影 ID 集合，不复制或改写原图。
- 检查器只编辑当前节点的 `title/parameters`，运行结果、历史和生命周期对象不得进入 Ant Design Form。

## 修改规则

- 连线表示显式数据输入；选择、高亮、面板开关等显示状态不得改变运行范围或进入画布快照。
- 同一节点的重复选择不发布无意义 store 更新。节点切换时重建独立检查器和 Form 实例，参考图只读写该节点的 `parameters.referenceImages`。
- 不在 render 或同步 effect 中反复写 store；传给 React Flow 的类型映射、回调和受控数组必须保持可解释的引用变化。
- 局部组件错误由区域错误边界承接，不得因为显示错误自动停止运行会话。

## 验证

- 先复现用户可观察路径，再补纯规则或 store 回归测试。
- 至少检查节点→空白→同节点、跨节点参考图、直接邻居高亮、拖动/连线、保存和运行中选择。
- 运行前端 test、lint、build；没有实际浏览器操作时明确保留人工复验项。
