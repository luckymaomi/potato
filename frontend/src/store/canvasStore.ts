import { applyEdgeChanges, applyNodeChanges, type Edge, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import { create } from 'zustand'
import { ApiRequestError } from '../api/client'
import { userErrorMessage } from '../errors/appError'
import { projectsApi } from '../api/projects'
import { CanvasSaveCoordinator, type CanvasSaveState } from '../features/canvas/canvasSaveCoordinator'
import {
  createCanvasSnapshot,
  normalizeCanvasEdges,
  normalizeCanvasNodes,
  readStoredCanvasSnapshot,
} from '../features/canvas/canvasSnapshot'
import type { CanvasNode, CanvasWorkspaceSnapshot, WorkflowGroup, WorkspaceTemplateInfo } from '../features/canvas/canvasTypes'
import { createProductionNodeData, type ProductionNodeData, type ProductionRole } from '../features/production/catalog'
import { createStarterWorkspace } from '../features/production/starterWorkspace'
import type { Project } from '../types/domain'

export type { CanvasNode, CanvasWorkspaceSnapshot, WorkflowGroup, WorkspaceTemplateInfo } from '../features/canvas/canvasTypes'
export type { ProductionNodeData as CanvasNodeData } from '../features/production/catalog'

interface CanvasState {
  project: Project | null
  nodes: CanvasNode[]
  edges: Edge[]
  workflowGroups: WorkflowGroup[]
  workspaceTemplate?: WorkspaceTemplateInfo
  loading: boolean
  error: string | null
  saveState: CanvasSaveState
  saveError: string | null
  selectedNodeId: string | null
  load: (id: number) => Promise<void>
  setNodes: (changes: NodeChange<CanvasNode>[]) => void
  setEdges: (changes: EdgeChange[]) => void
  addNode: (role: ProductionRole, position?: XYPosition, data?: Partial<ProductionNodeData>) => string
  updateNodeData: (id: string, data: Partial<ProductionNodeData>) => void
  duplicateNodes: (ids: string[]) => string[]
  removeNode: (id: string) => void
  removeNodes: (ids: string[]) => void
  setSelectedNode: (id: string | null) => void
  addEdge: (edge: Edge) => void
  replaceWorkspace: (snapshot: CanvasWorkspaceSnapshot) => void
  queueSave: () => void
  save: () => Promise<void>
  hasUnsavedChanges: () => boolean
  disposeSaveCoordinator: () => Promise<void>
  createWorkflowGroup: (nodeIds: string[], name?: string) => string
  updateWorkflowGroup: (id: string, values: Partial<Pick<WorkflowGroup, 'name' | 'nodeIds'>>) => void
  removeWorkflowGroup: (id: string) => void
}

function nextId(kind: string) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function positionFor(index: number): XYPosition {
  return { x: 72 + (index % 4) * 320, y: 72 + Math.floor(index / 4) * 245 }
}

function compactGroups(groups: WorkflowGroup[], liveNodeIds: Set<string>): WorkflowGroup[] {
  return groups
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => liveNodeIds.has(id)) }))
    .filter((group) => group.nodeIds.length > 0)
}

export const useCanvasStore = create<CanvasState>((set, get) => {
  let saveCoordinator: CanvasSaveCoordinator<CanvasWorkspaceSnapshot, Project> | null = null
  let loadGeneration = 0

  const currentSnapshot = () => {
    const { nodes, edges, workflowGroups, workspaceTemplate } = get()
    return createCanvasSnapshot(nodes, edges, workflowGroups, workspaceTemplate)
  }

  const attachSaveCoordinator = (project: Project, snapshot: CanvasWorkspaceSnapshot) => {
    saveCoordinator?.dispose()
    saveCoordinator = new CanvasSaveCoordinator({
      initialRevision: project.canvas_revision,
      initialSnapshot: snapshot,
      persist: (nextSnapshot, expectedRevision) => projectsApi.saveCanvasLayout(
        project.id,
        nextSnapshot,
        expectedRevision,
      ),
      isConflict: (error) => error instanceof ApiRequestError && error.code === 'CANVAS_REVISION_CONFLICT',
      onStateChange: (saveState, error) => set({
        saveState,
        saveError: error ? userErrorMessage(error) : null,
      }),
      onSaved: (savedProject) => {
        if (get().project?.id === savedProject.id) set({ project: savedProject, error: null })
      },
    })
  }

  return {
    project: null,
    nodes: [],
    edges: [],
    workflowGroups: [],
    workspaceTemplate: undefined,
    loading: false,
    error: null,
    saveState: 'idle',
    saveError: null,
    selectedNodeId: null,

    load: async (id) => {
      const generation = ++loadGeneration
      saveCoordinator?.dispose()
      saveCoordinator = null
      set({
        project: null,
        nodes: [],
        edges: [],
        workflowGroups: [],
        workspaceTemplate: undefined,
        loading: true,
        error: null,
        saveState: 'idle',
        saveError: null,
        selectedNodeId: null,
      })
      try {
        let project = await projectsApi.get(id)
        if (generation !== loadGeneration) return
        let snapshot: CanvasWorkspaceSnapshot
        const saved = readStoredCanvasSnapshot(project.metadata)
        if (!saved.workspace_nodes?.length) {
          snapshot = createStarterWorkspace(project)
          project = await projectsApi.saveCanvasLayout(project.id, snapshot, project.canvas_revision)
        } else {
          snapshot = {
            workspace_nodes: saved.workspace_nodes,
            edges: saved.edges || [],
            workflow_groups: saved.workflow_groups || [],
            ...(saved.template ? { template: saved.template } : {}),
          }
        }
        if (generation !== loadGeneration) return
        set({
          project,
          nodes: normalizeCanvasNodes(snapshot.workspace_nodes, project),
          edges: normalizeCanvasEdges(snapshot.edges),
          workflowGroups: snapshot.workflow_groups,
          workspaceTemplate: snapshot.template,
          loading: false,
        })
        attachSaveCoordinator(project, snapshot)
      } catch (error) {
        if (generation === loadGeneration) set({ loading: false, error: userErrorMessage(error) })
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

  addNode: (role, position = positionFor(get().nodes.length), data = {}) => {
    const id = nextId(role)
    const defaults = createProductionNodeData(role, data)
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
    nodes: state.nodes.map((node) => node.id === id ? {
      ...node,
      data: {
        ...node.data,
        ...data,
        parameters: data.parameters ? {
          ...node.data.parameters,
          ...data.parameters,
          ...(data.parameters.referenceImages !== undefined
            ? { referenceImages: [...data.parameters.referenceImages] }
            : {}),
        } : node.data.parameters,
        assetRefs: data.assetRefs ? { ...node.data.assetRefs, ...data.assetRefs } : node.data.assetRefs,
        result: data.result ? { ...node.data.result, ...data.result } : node.data.result,
      },
    } : node),
  })),

  duplicateNodes: (ids) => {
    const selectedIds = new Set(ids)
    const idMap = new Map<string, string>()
    const sourceNodes = get().nodes.filter((node) => selectedIds.has(node.id))
    sourceNodes.forEach((node) => idMap.set(node.id, nextId(node.data.role)))
    const copies = sourceNodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) as string,
      selected: true,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      data: {
        ...node.data,
        title: `${node.data.title || '节点'} 副本`,
        parameters: {
          ...node.data.parameters,
          referenceImages: node.data.parameters.referenceImages ? [...node.data.parameters.referenceImages] : undefined,
        },
        assetRefs: Object.fromEntries(Object.entries(node.data.assetRefs).map(([key, values]) => [key, values ? [...values] : values])),
        result: {},
        history: [],
        execution: undefined,
        status: 'idle' as const,
        manuallyCompleted: false,
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
  setSelectedNode: (id) => {
    if (get().selectedNodeId === id) return
    set({ selectedNodeId: id })
  },

  addEdge: (edge) => set((state) => {
    if (state.edges.some((current) => current.source === edge.source && current.target === edge.target)) return {}
    return { edges: [...state.edges, edge] }
  }),

  replaceWorkspace: (snapshot) => set({
    nodes: normalizeCanvasNodes(snapshot.workspace_nodes, get().project || undefined),
    edges: normalizeCanvasEdges(snapshot.edges),
    workflowGroups: snapshot.workflow_groups,
    workspaceTemplate: snapshot.template,
    selectedNodeId: null,
  }),

  queueSave: () => {
    if (!get().project || !saveCoordinator) return
    saveCoordinator.queue(currentSnapshot())
  },

  save: async () => {
    if (!get().project || !saveCoordinator) return
    saveCoordinator.queue(currentSnapshot())
    await saveCoordinator.flush()
  },

  hasUnsavedChanges: () => saveCoordinator?.hasPendingWrite ?? false,

  disposeSaveCoordinator: async () => {
    const coordinator = saveCoordinator
    if (!coordinator) return
    try {
      await coordinator.flush()
    } finally {
      coordinator.dispose()
      if (saveCoordinator === coordinator) saveCoordinator = null
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
  }
})
