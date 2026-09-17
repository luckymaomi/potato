import { applyEdgeChanges, applyNodeChanges, type Edge, type EdgeChange, type Node, type NodeChange, type XYPosition } from '@xyflow/react'
import { create } from 'zustand'
import { projectsApi } from '../api/projects'
import { createStarterWorkspace } from '../features/templates/starterWorkspace'
import type { Project } from '../types/domain'
import { mediaUrl } from '../utils/mediaUrl'

export type CanvasNodeKind = 'text' | 'image' | 'video' | 'character' | 'scene' | 'prop' | 'storyboard'
export type TextMode = 'manual' | 'ai'
export type MediaMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video' | 'storyboard'

export interface CanvasNodeData {
  label: string
  preset: CanvasNodeKind
  title?: string
  prompt?: string
  text?: string
  mode?: TextMode | MediaMode
  entityId?: number
  episodeId?: number
  mediaUrl?: string
  mediaKind?: 'image' | 'video'
  referenceImages?: string[]
  status?: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'
  taskId?: string
  error?: string
  provider?: string
  model?: string
  duration?: number
  aspectRatio?: string
  apiAction?: string
  [key: string]: unknown
}

export type CanvasNode = Node<CanvasNodeData>

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
  workspace_nodes: Array<Pick<CanvasNode, 'id' | 'type' | 'position' | 'data'> & { positionAbsolute?: XYPosition }>
  edges: Edge[]
  workflow_groups: WorkflowGroup[]
  template?: WorkspaceTemplateInfo
}

interface WorkbenchState {
  project: Project | null
  nodes: CanvasNode[]
  edges: Edge[]
  workflowGroups: WorkflowGroup[]
  workspaceTemplate?: WorkspaceTemplateInfo
  loading: boolean
  saving: boolean
  error: string | null
  selectedNodeId: string | null
  load: (id: number) => Promise<void>
  setNodes: (changes: NodeChange<CanvasNode>[]) => void
  setEdges: (changes: EdgeChange[]) => void
  addNode: (kind: CanvasNodeKind, position?: XYPosition, data?: Partial<CanvasNodeData>) => string
  updateNodeData: (id: string, data: Partial<CanvasNodeData>) => void
  duplicateNodes: (ids: string[]) => string[]
  removeNode: (id: string) => void
  removeNodes: (ids: string[]) => void
  setSelectedNode: (id: string | null) => void
  addEdge: (edge: Edge) => void
  replaceWorkspace: (snapshot: CanvasWorkspaceSnapshot) => void
  save: () => Promise<void>
  createWorkflowGroup: (nodeIds: string[], name?: string) => string
  updateWorkflowGroup: (id: string, values: Partial<Pick<WorkflowGroup, 'name' | 'nodeIds'>>) => void
  removeWorkflowGroup: (id: string) => void
}

const labelByKind: Record<CanvasNodeKind, string> = {
  text: '文本节点', image: '图片节点', video: '视频节点', character: '角色节点', scene: '场景节点', prop: '道具节点', storyboard: '分镜节点',
}

function nextId(kind: string) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function storedSnapshot(metadata: Project['metadata'] | undefined): Partial<CanvasWorkspaceSnapshot> {
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

function positionFor(index: number): XYPosition {
  return { x: 72 + (index % 4) * 320, y: 72 + Math.floor(index / 4) * 245 }
}

function normalizeNodes(nodes: CanvasWorkspaceSnapshot['workspace_nodes']): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    type: node.type || 'canvas',
    data: {
      ...node.data,
      mediaUrl: mediaUrl(String(node.data.mediaUrl || '')) || node.data.mediaUrl,
      mediaKind: node.data.mediaKind || (node.data.preset === 'video' ? 'video' : node.data.preset === 'image' ? 'image' : undefined),
    },
  })) as CanvasNode[]
}

function normalizeEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({ ...edge, type: 'bezier' }))
}

function canvasPayload(
  nodes: CanvasNode[],
  edges: Edge[],
  workflowGroups: WorkflowGroup[],
  template?: WorkspaceTemplateInfo,
): CanvasWorkspaceSnapshot {
  return {
    workspace_nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges,
    workflow_groups: workflowGroups,
    ...(template ? { template } : {}),
  }
}

function compactGroups(groups: WorkflowGroup[], liveNodeIds: Set<string>): WorkflowGroup[] {
  return groups
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => liveNodeIds.has(id)) }))
    .filter((group) => group.nodeIds.length > 0)
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  project: null,
  nodes: [],
  edges: [],
  workflowGroups: [],
  workspaceTemplate: undefined,
  loading: false,
  saving: false,
  error: null,
  selectedNodeId: null,

  load: async (id) => {
    set({
      project: null,
      nodes: [],
      edges: [],
      workflowGroups: [],
      workspaceTemplate: undefined,
      loading: true,
      error: null,
      selectedNodeId: null,
    })
    try {
      let project = await projectsApi.get(id)
      const saved = storedSnapshot(project.metadata)
      if (!saved.workspace_nodes?.length) {
        const starter = createStarterWorkspace(project)
        project = await projectsApi.saveCanvasLayout(project.id, starter, starter.workflow_groups)
        set({
          project,
          nodes: normalizeNodes(starter.workspace_nodes),
          edges: normalizeEdges(starter.edges),
          workflowGroups: starter.workflow_groups,
          workspaceTemplate: starter.template,
          loading: false,
        })
        return
      }
      set({
        project,
        nodes: normalizeNodes(saved.workspace_nodes),
        edges: normalizeEdges(saved.edges || []),
        workflowGroups: saved.workflow_groups || [],
        workspaceTemplate: saved.template,
        loading: false,
      })
    } catch (error) {
      set({ loading: false, error: (error as Error).message })
    }
  },

  setNodes: (changes) => set((state) => {
    const nodes = applyNodeChanges(changes, state.nodes) as CanvasNode[]
    const liveNodeIds = new Set(nodes.map((node) => node.id))
    return {
      nodes,
      edges: state.edges.filter((edge) => liveNodeIds.has(edge.source) && liveNodeIds.has(edge.target)),
      workflowGroups: compactGroups(state.workflowGroups, liveNodeIds),
      selectedNodeId: state.selectedNodeId && liveNodeIds.has(state.selectedNodeId) ? state.selectedNodeId : null,
    }
  }),
  setEdges: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  addNode: (kind, position = positionFor(get().nodes.length), data = {}) => {
    const id = nextId(kind)
    const mediaDefaults = ['image', 'character', 'scene', 'prop'].includes(kind)
      ? { prompt: '', mode: 'text-to-image' as MediaMode, mediaKind: 'image' as const }
      : ['video'].includes(kind)
        ? { prompt: '', mode: 'text-to-video' as MediaMode, mediaKind: 'video' as const }
        : kind === 'storyboard'
          ? { prompt: '' }
          : {}
    const defaults: CanvasNodeData = {
      label: labelByKind[kind],
      title: labelByKind[kind],
      preset: kind,
      status: 'idle',
      ...(kind === 'text' ? { text: '', mode: 'manual' as TextMode } : mediaDefaults),
      ...data,
    }
    set((state) => ({
      nodes: [
        ...state.nodes.map((node) => ({ ...node, selected: false })),
        { id, type: 'canvas', position, data: defaults, selected: true },
      ],
      selectedNodeId: id,
    }))
    return id
  },

  updateNodeData: (id, data) => set((state) => ({
    nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...data } } : node),
  })),

  duplicateNodes: (ids) => {
    const selectedIds = new Set(ids)
    const idMap = new Map<string, string>()
    const sourceNodes = get().nodes.filter((node) => selectedIds.has(node.id))
    sourceNodes.forEach((node) => idMap.set(node.id, nextId(node.data.preset)))
    const copies = sourceNodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) as string,
      selected: true,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      data: {
        ...node.data,
        title: `${node.data.title || node.data.label} 副本`,
        label: `${node.data.title || node.data.label} 副本`,
        referenceImages: node.data.referenceImages ? [...node.data.referenceImages] : undefined,
        status: 'idle' as const,
        taskId: undefined,
        error: '',
      },
    }))
    const copiedEdges = get().edges
      .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: nextId('edge'),
        source: idMap.get(edge.source) as string,
        target: idMap.get(edge.target) as string,
        selected: false,
      }))
    const copyIds = copies.map((node) => node.id)
    set((state) => ({
      nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), ...copies],
      edges: [...state.edges, ...copiedEdges],
      selectedNodeId: copyIds[0] || null,
    }))
    return copyIds
  },

  removeNode: (id) => get().removeNodes([id]),
  removeNodes: (ids) => set((state) => {
    const removed = new Set(ids)
    const nodes = state.nodes.filter((node) => !removed.has(node.id))
    const liveNodeIds = new Set(nodes.map((node) => node.id))
    return {
      nodes,
      edges: state.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
      workflowGroups: compactGroups(state.workflowGroups, liveNodeIds),
      selectedNodeId: state.selectedNodeId && removed.has(state.selectedNodeId) ? null : state.selectedNodeId,
    }
  }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  addEdge: (edge) => set((state) => {
    if (state.edges.some((current) => current.source === edge.source && current.target === edge.target)) return {}
    return { edges: [...state.edges, edge] }
  }),

  replaceWorkspace: (snapshot) => set({
    nodes: normalizeNodes(snapshot.workspace_nodes),
    edges: normalizeEdges(snapshot.edges),
    workflowGroups: snapshot.workflow_groups,
    workspaceTemplate: snapshot.template,
    selectedNodeId: null,
  }),

  save: async () => {
    const { project, nodes, edges, workflowGroups, workspaceTemplate } = get()
    if (!project) return
    set({ saving: true })
    try {
      const snapshot = canvasPayload(nodes, edges, workflowGroups, workspaceTemplate)
      const next = await projectsApi.saveCanvasLayout(project.id, snapshot, workflowGroups)
      set({ project: next, saving: false, error: null })
    } catch (error) {
      set({ saving: false })
      throw error
    }
  },

  createWorkflowGroup: (nodeIds, name) => {
    const id = nextId('workflow')
    const uniqueIds = [...new Set(nodeIds)]
    set((state) => ({
      workflowGroups: [...state.workflowGroups, {
        id,
        name: name?.trim() || `工作流 ${state.workflowGroups.length + 1}`,
        nodeIds: uniqueIds,
        createdAt: new Date().toISOString(),
      }],
    }))
    return id
  },
  updateWorkflowGroup: (id, values) => set((state) => ({
    workflowGroups: state.workflowGroups.map((group) => group.id === id
      ? { ...group, ...values, name: values.name?.trim() || group.name, updatedAt: new Date().toISOString() }
      : group),
  })),
  removeWorkflowGroup: (id) => set((state) => ({
    workflowGroups: state.workflowGroups.filter((group) => group.id !== id),
  })),
}))
