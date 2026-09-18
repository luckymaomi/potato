import { createContext, useContext } from 'react'
import type { Edge } from '@xyflow/react'
import type { CanvasNode } from './canvasTypes'

export interface ConnectionHighlight {
  selectedNodeId: string | null
  relatedNodeIds: ReadonlySet<string>
  relatedEdgeIds: ReadonlySet<string>
}

const emptyHighlight: ConnectionHighlight = {
  selectedNodeId: null,
  relatedNodeIds: new Set(),
  relatedEdgeIds: new Set(),
}

export const ConnectionHighlightContext = createContext<ConnectionHighlight>(emptyHighlight)

export function buildConnectionHighlight(
  nodes: readonly CanvasNode[],
  edges: readonly Edge[],
  selectedNodeId: string | null,
): ConnectionHighlight {
  if (!selectedNodeId) return emptyHighlight
  const liveNodeIds = new Set(nodes.map((node) => node.id))
  if (!liveNodeIds.has(selectedNodeId)) return emptyHighlight
  const relatedNodeIds = new Set<string>()
  const relatedEdgeIds = new Set<string>()
  for (const edge of edges) {
    if (edge.source === selectedNodeId && liveNodeIds.has(edge.target)) {
      relatedNodeIds.add(edge.target)
      relatedEdgeIds.add(edge.id)
    } else if (edge.target === selectedNodeId && liveNodeIds.has(edge.source)) {
      relatedNodeIds.add(edge.source)
      relatedEdgeIds.add(edge.id)
    }
  }
  return { selectedNodeId, relatedNodeIds, relatedEdgeIds }
}

export function useConnectionHighlight(): ConnectionHighlight {
  return useContext(ConnectionHighlightContext)
}
