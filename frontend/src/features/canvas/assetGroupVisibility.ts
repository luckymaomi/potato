import type { Edge } from '@xyflow/react'
import { assetKindOf, type AssetKind } from '../production/catalog'
import type { CanvasNode } from './canvasTypes'

export interface VisibleAssetGraph {
  nodes: CanvasNode[]
  edges: Edge[]
}

export function visibleAssetGraph(
  nodes: CanvasNode[],
  edges: Edge[],
  collapsed: ReadonlySet<AssetKind>,
): VisibleAssetGraph {
  if (!collapsed.size) return { nodes, edges }
  const hiddenIds = new Set(nodes.flatMap((node) => {
    const kind = assetKindOf(node.data)
    return kind && collapsed.has(kind) ? [node.id] : []
  }))
  if (!hiddenIds.size) return { nodes, edges }
  return {
    nodes: nodes.filter((node) => !hiddenIds.has(node.id)),
    edges: edges.filter((edge) => !hiddenIds.has(edge.source) && !hiddenIds.has(edge.target)),
  }
}

export function assetGroupCounts(nodes: CanvasNode[]): Record<AssetKind, number> {
  const counts: Record<AssetKind, number> = { character: 0, scene: 0, prop: 0 }
  nodes.forEach((node) => {
    const kind = assetKindOf(node.data)
    if (kind) counts[kind] += 1
  })
  return counts
}
