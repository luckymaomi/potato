import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import { createProductionNodeData } from '../production/catalog'
import type { CanvasNode } from './canvasTypes'
import { buildConnectionHighlight } from './connectionHighlight'

function node(id: string): CanvasNode {
  return {
    id,
    type: 'canvas',
    position: { x: 0, y: 0 },
    data: createProductionNodeData('generic-image'),
  }
}

describe('节点直接关联高亮', () => {
  const nodes = ['a', 'b', 'c', 'd'].map(node)
  const edges: Edge[] = [
    { id: 'a-b', source: 'a', target: 'b', type: 'default' },
    { id: 'c-a', source: 'c', target: 'a', type: 'default' },
    { id: 'b-c', source: 'b', target: 'c', type: 'default' },
  ]

  it('只投影选中节点的直接邻居和对应边', () => {
    const highlight = buildConnectionHighlight(nodes, edges, 'a')

    expect([...highlight.relatedNodeIds].sort()).toEqual(['b', 'c'])
    expect([...highlight.relatedEdgeIds].sort()).toEqual(['a-b', 'c-a'])
    expect(highlight.relatedNodeIds.has('d')).toBe(false)
    expect(highlight.relatedEdgeIds.has('b-c')).toBe(false)
  })

  it('没有单选节点时不创建业务选择或修改原图', () => {
    const highlight = buildConnectionHighlight(nodes, edges, null)

    expect(highlight.relatedNodeIds.size).toBe(0)
    expect(highlight.relatedEdgeIds.size).toBe(0)
    expect(nodes.some((item) => item.selected)).toBe(false)
    expect(edges.some((item) => item.selected)).toBe(false)
  })
})
