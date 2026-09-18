import type { Edge } from '@xyflow/react'
import type { Project } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import type {
  CanvasNode,
  CanvasWorkspaceSnapshot,
  WorkflowGroup,
  WorkspaceTemplateInfo,
} from './canvasTypes'
import { restoreProductionNodeLifecycle } from '../production/lifecycle'

export function readStoredCanvasSnapshot(metadata: Project['metadata'] | undefined): Partial<CanvasWorkspaceSnapshot> {
  const value = metadata?.canvas_layout
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const snapshot = value as Partial<CanvasWorkspaceSnapshot>
  return {
    workspace_nodes: Array.isArray(snapshot.workspace_nodes) ? snapshot.workspace_nodes : [],
    edges: Array.isArray(snapshot.edges) ? snapshot.edges : [],
    workflow_groups: Array.isArray(snapshot.workflow_groups) ? snapshot.workflow_groups : [],
    template: snapshot.template && typeof snapshot.template === 'object' ? snapshot.template : undefined,
  }
}

export function normalizeCanvasNodes(nodes: CanvasWorkspaceSnapshot['workspace_nodes'], project?: Project): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    type: 'canvas',
    data: project ? restoreProductionNodeLifecycle({
      ...node.data,
      parameters: {
        ...node.data.parameters,
        referenceImages: node.data.parameters.referenceImages ? [...node.data.parameters.referenceImages] : undefined,
      },
      result: {
        ...node.data.result,
        outputUrl: mediaUrl(String(node.data.result.outputUrl || '')) || node.data.result.outputUrl,
      },
    }, project) : {
      ...node.data,
      parameters: {
        ...node.data.parameters,
        referenceImages: node.data.parameters.referenceImages ? [...node.data.parameters.referenceImages] : undefined,
      },
      result: {
        ...node.data.result,
        outputUrl: mediaUrl(String(node.data.result.outputUrl || '')) || node.data.result.outputUrl,
      },
    },
  })) as CanvasNode[]
}

export function normalizeCanvasEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({ ...edge, type: 'default', selected: false }))
}

export function createCanvasSnapshot(
  nodes: CanvasNode[],
  edges: Edge[],
  workflowGroups: WorkflowGroup[],
  template?: WorkspaceTemplateInfo,
): CanvasWorkspaceSnapshot {
  return {
    workspace_nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ selected: _selected, ...edge }) => edge),
    workflow_groups: workflowGroups,
    ...(template ? { template } : {}),
  }
}
