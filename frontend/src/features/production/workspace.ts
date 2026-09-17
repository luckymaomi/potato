import type { Edge } from '@xyflow/react'
import type { CanvasNode, CanvasWorkspaceSnapshot, WorkflowGroup } from '../canvas/canvasTypes'
import { createProductionNodeData, type ProductionNodeData, type ProductionRole } from './catalog'

export interface ProductionNodeSpec {
  id: string
  role: ProductionRole
  x: number
  y: number
  data?: Partial<ProductionNodeData>
}

export interface ProductionWorkspaceSpec {
  nodes: ProductionNodeSpec[]
  connections: Array<[string, string]>
  groups: Array<{ id: string; name: string; nodeIds: string[] }>
  template: { id: string; version: number }
  edgePrefix: string
}

export function createProductionWorkspace(spec: ProductionWorkspaceSpec): CanvasWorkspaceSnapshot {
  const nodes: CanvasNode[] = spec.nodes.map((item) => ({
    id: item.id,
    type: 'canvas',
    position: { x: item.x, y: item.y },
    data: createProductionNodeData(item.role, item.data),
  }))
  const liveIds = new Set(nodes.map((node) => node.id))
  const edges: Edge[] = spec.connections.map(([source, target], index) => {
    if (!liveIds.has(source) || !liveIds.has(target)) throw new Error(`生产工作区连线引用未知节点：${source} → ${target}`)
    return {
      id: `${spec.edgePrefix}-${index}`,
      source,
      target,
      type: 'bezier',
    }
  })
  const now = new Date().toISOString()
  const workflowGroups: WorkflowGroup[] = spec.groups.map((group) => ({ ...group, createdAt: now }))
  return {
    workspace_nodes: nodes,
    edges,
    workflow_groups: workflowGroups,
    template: spec.template,
  }
}
