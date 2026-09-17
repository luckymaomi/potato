import type { Edge, Node } from '@xyflow/react'
import type { ProductionNodeData } from '../production/catalog'

export type CanvasNode = Node<ProductionNodeData>

export interface WorkflowGroup {
  id: string
  name: string
  nodeIds: string[]
  createdAt: string
  updatedAt?: string
}

export interface WorkspaceTemplateInfo {
  id: string
  version: number
}

export interface CanvasWorkspaceSnapshot {
  workspace_nodes: Array<Pick<CanvasNode, 'id' | 'type' | 'position' | 'data'>>
  edges: Edge[]
  workflow_groups: WorkflowGroup[]
  template?: WorkspaceTemplateInfo
}
