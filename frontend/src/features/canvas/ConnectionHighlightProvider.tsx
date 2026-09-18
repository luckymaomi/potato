import { useMemo, type ReactNode } from 'react'
import type { Edge } from '@xyflow/react'
import type { CanvasNode } from './canvasTypes'
import { buildConnectionHighlight, ConnectionHighlightContext } from './connectionHighlight'

export function ConnectionHighlightProvider({
  nodes,
  edges,
  selectedNodeId,
  children,
}: {
  nodes: readonly CanvasNode[]
  edges: readonly Edge[]
  selectedNodeId: string | null
  children: ReactNode
}) {
  const value = useMemo(
    () => buildConnectionHighlight(nodes, edges, selectedNodeId),
    [nodes, edges, selectedNodeId],
  )
  return <ConnectionHighlightContext.Provider value={value}>{children}</ConnectionHighlightContext.Provider>
}
