import { describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../store/canvasStore'

describe('画布选择状态', () => {
  it('重复选择同一节点不会再次发布 store 更新', () => {
    useCanvasStore.setState({ selectedNodeId: 'image-1' })
    const listener = vi.fn()
    const unsubscribe = useCanvasStore.subscribe(listener)

    useCanvasStore.getState().setSelectedNode('image-1')
    expect(listener).not.toHaveBeenCalled()

    useCanvasStore.getState().setSelectedNode(null)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
