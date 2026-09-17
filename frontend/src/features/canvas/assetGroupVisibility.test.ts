import { describe, expect, it } from 'vitest'
import { createProductionNodeData } from '../production/catalog'
import type { CanvasNode } from './canvasTypes'
import { visibleAssetGraph } from './assetGroupVisibility'

describe('资产节点视觉折叠', () => {
  it('只隐藏指定资产组及其连线，不修改原始生产图', () => {
    const nodes: CanvasNode[] = [
      { id: 'character', type: 'canvas', position: { x: 0, y: 0 }, data: createProductionNodeData('character-asset') },
      { id: 'scene', type: 'canvas', position: { x: 0, y: 1 }, data: createProductionNodeData('scene-asset') },
      { id: 'shot', type: 'canvas', position: { x: 1, y: 0 }, data: createProductionNodeData('storyboard-image') },
    ]
    const edges = [
      { id: 'character-shot', source: 'character', target: 'shot' },
      { id: 'scene-shot', source: 'scene', target: 'shot' },
    ]
    const visible = visibleAssetGraph(nodes, edges, new Set(['character']))
    expect(visible.nodes.map((node) => node.id)).toEqual(['scene', 'shot'])
    expect(visible.edges.map((edge) => edge.id)).toEqual(['scene-shot'])
    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)
  })
})
