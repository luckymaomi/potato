import { describe, expect, it } from 'vitest'
import type { CanvasNode } from './canvasTypes'
import { createCanvasSnapshot } from './canvasSnapshot'

describe('createCanvasSnapshot', () => {
  it('只保存画布文档，不把节点和连线选择态写入服务端', () => {
    const node: CanvasNode = {
      id: 'text-1',
      type: 'canvas',
      position: { x: 10, y: 20 },
      selected: true,
      dragging: true,
      data: { role: 'script', text: '内容' },
    }
    const snapshot = createCanvasSnapshot(
      [node],
      [{ id: 'edge-1', source: 'text-1', target: 'image-1', type: 'bezier', selected: true }],
      [],
    )

    expect(snapshot.workspace_nodes[0]).toEqual({
      id: 'text-1',
      type: 'canvas',
      position: { x: 10, y: 20 },
      data: { role: 'script', text: '内容' },
    })
    expect(snapshot.edges[0]).not.toHaveProperty('selected')
  })
})
