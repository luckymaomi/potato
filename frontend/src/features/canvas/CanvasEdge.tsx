import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { useConnectionHighlight } from './connectionHighlight'

export function CanvasEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  style,
  interactionWidth,
}: EdgeProps<Edge>) {
  const { relatedEdgeIds } = useConnectionHighlight()
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      markerStart={markerStart}
      style={style}
      interactionWidth={interactionWidth}
      className={relatedEdgeIds.has(id) ? 'canvas-edge-related' : undefined}
    />
  )
}
