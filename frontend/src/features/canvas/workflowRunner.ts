import type { Edge } from '@xyflow/react'
import { presentError, type ErrorPresentation } from '../../errors/appError'
import type { Project } from '../../types/domain'
import { executeProductionNode, prepareNodeForExecution, type NodeUpdater } from '../production/executor'
import type { CanvasNode } from './canvasTypes'
import { orderByConnections } from './canvasGraph'
import { CanvasRunSession, CanvasRunStoppedError } from './runSession'

export class WorkflowRunTerminatedError extends Error {
  readonly nodeId: string
  readonly presentation: ErrorPresentation
  readonly completed: number
  readonly scopeLabel: string

  constructor(
    nodeId: string,
    presentation: ErrorPresentation,
    completed: number,
    scopeLabel: string,
    options?: ErrorOptions,
  ) {
    super(`${presentation.displayMessage} 本次${scopeLabel}已终止，后续节点没有运行。`, options)
    this.name = 'WorkflowRunTerminatedError'
    this.nodeId = nodeId
    this.presentation = presentation
    this.completed = completed
    this.scopeLabel = scopeLabel
  }
}

interface WorkflowState {
  project: Project
  nodes: CanvasNode[]
  edges: Edge[]
}

export async function runWorkflow(input: {
  ids: string[]
  label: string
  session: CanvasRunSession
  getState: () => WorkflowState
  updateNode: NodeUpdater
  executeNode?: typeof executeProductionNode
}): Promise<{ completed: number }> {
  const initial = input.getState()
  const uniqueIds = [...new Set(input.ids)].filter((id) => initial.nodes.some((node) => node.id === id))
  const ordered = orderByConnections(initial.nodes, initial.edges, uniqueIds)
  let completed = 0
  for (const orderedNode of ordered) {
    input.session.throwIfStopped()
    const current = input.getState()
    const node = current.nodes.find((item) => item.id === orderedNode.id)
    if (!node) continue
    const prepared = prepareNodeForExecution(node, current.nodes, current.edges)
    input.updateNode(node.id, prepared.data)
    try {
      await (input.executeNode ?? executeProductionNode)(prepared, current.project, input.updateNode, input.session)
      completed += 1
    } catch (error) {
      if (error instanceof CanvasRunStoppedError || input.session.stopped) {
        input.updateNode(node.id, { status: 'cancelled', error: '' })
        throw new CanvasRunStoppedError()
      }
      const presentation = presentError(error)
      const terminated = new WorkflowRunTerminatedError(node.id, presentation, completed, input.label, { cause: error })
      input.updateNode(node.id, { status: 'failed', error: terminated.message })
      throw terminated
    }
  }
  return { completed }
}
