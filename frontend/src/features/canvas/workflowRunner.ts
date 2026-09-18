import type { Edge } from '@xyflow/react'
import { presentError, type ErrorPresentation } from '../../errors/appError'
import type { Project } from '../../types/domain'
import { executeProductionNode, prepareNodeForExecution, type NodeUpdater } from '../production/executor'
import type { AssetReferences, ProductionNodeResult } from '../production/catalog'
import { isReusableProductionNode } from '../production/lifecycle'
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

export interface WorkflowRunProgress {
  completed: number
  total: number
  currentIndex: number
  currentNodeId: string
  currentTitle: string
  startedAt: string
  stage: 'running' | 'completed'
}

export async function runWorkflow(input: {
  ids: string[]
  label: string
  session: CanvasRunSession
  getState: () => WorkflowState
  updateNode: NodeUpdater
  executeNode?: typeof executeProductionNode
  onProgress?: (progress: WorkflowRunProgress) => void
}): Promise<{ completed: number }> {
  const initial = input.getState()
  const uniqueIds = [...new Set(input.ids)].filter((id) => {
    const node = initial.nodes.find((item) => item.id === id)
    return node && node.data.manuallyCompleted !== true
  })
  const ordered = orderByConnections(initial.nodes, initial.edges, uniqueIds)
  let completed = 0
  for (const [index, orderedNode] of ordered.entries()) {
    input.session.throwIfStopped()
    const current = input.getState()
    const node = current.nodes.find((item) => item.id === orderedNode.id)
    if (!node || node.data.manuallyCompleted === true) continue
    const startedAt = new Date().toISOString()
    const reusableData = isReusableProductionNode(node.data)
      ? {
          result: restorableResult(node.data.result),
          history: node.data.history?.map(restorableResult),
          assetRefs: restorableAssetRefs(node.data.assetRefs),
        }
      : undefined
    try {
      input.onProgress?.({
        completed,
        total: ordered.length,
        currentIndex: index + 1,
        currentNodeId: node.id,
        currentTitle: node.data.title || node.id,
        startedAt,
        stage: 'running',
      })
      const prepared = prepareNodeForExecution(node, current.nodes, current.edges)
      input.updateNode(node.id, prepared.node.data)
      await (input.executeNode ?? executeProductionNode)(prepared.node, current.project, input.updateNode, input.session, prepared.context)
      completed += 1
      input.onProgress?.({
        completed,
        total: ordered.length,
        currentIndex: index + 1,
        currentNodeId: node.id,
        currentTitle: node.data.title || node.id,
        startedAt,
        stage: 'completed',
      })
    } catch (error) {
      if (error instanceof CanvasRunStoppedError || input.session.stopped) {
        const latestExecution = input.getState().nodes.find((item) => item.id === node.id)?.data.execution
        input.updateNode(node.id, reusableData
          ? {
              status: 'completed',
              result: reusableData.result,
              history: reusableData.history,
              assetRefs: reusableData.assetRefs,
              execution: {
                message: '重跑已停止，继续使用已有结果',
                startedAt: latestExecution?.startedAt || startedAt,
                finishedAt: new Date().toISOString(),
              },
              error: '重跑已停止，继续使用已有结果。',
            }
          : {
              status: 'cancelled',
              execution: { message: '运行已停止', startedAt: latestExecution?.startedAt || startedAt, finishedAt: new Date().toISOString() },
              error: '',
            })
        throw new CanvasRunStoppedError()
      }
      const presentation = presentError(error)
      const terminated = new WorkflowRunTerminatedError(node.id, presentation, completed, input.label, { cause: error })
      const latestExecution = input.getState().nodes.find((item) => item.id === node.id)?.data.execution
      input.updateNode(node.id, reusableData
        ? {
            status: 'completed',
            result: reusableData.result,
            history: reusableData.history,
            assetRefs: reusableData.assetRefs,
            execution: {
              message: '重跑失败，继续使用已有结果',
              startedAt: latestExecution?.startedAt || startedAt,
              finishedAt: new Date().toISOString(),
            },
            error: `${terminated.message} 重跑失败，继续使用已有结果。`,
          }
        : {
            status: 'failed',
            execution: { message: presentation.displayMessage, startedAt: latestExecution?.startedAt || startedAt, finishedAt: new Date().toISOString() },
            error: terminated.message,
          })
      throw terminated
    }
  }
  return { completed }
}

function restorableResult(result: ProductionNodeResult): ProductionNodeResult {
  return {
    text: result.text,
    outputUrl: result.outputUrl,
    provider: result.provider,
    model: result.model,
    assetRefs: result.assetRefs ? restorableAssetRefs(result.assetRefs) : undefined,
    taskId: result.taskId,
    generationId: result.generationId,
    localPath: result.localPath,
    mediaAvailable: result.mediaAvailable,
    createdAt: result.createdAt,
  }
}

function restorableAssetRefs(assetRefs: AssetReferences): AssetReferences {
  return {
    episodes: assetRefs.episodes ? [...assetRefs.episodes] : undefined,
    characters: assetRefs.characters ? [...assetRefs.characters] : undefined,
    scenes: assetRefs.scenes ? [...assetRefs.scenes] : undefined,
    props: assetRefs.props ? [...assetRefs.props] : undefined,
    storyboards: assetRefs.storyboards ? [...assetRefs.storyboards] : undefined,
  }
}
