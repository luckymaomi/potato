import type { Edge } from '@xyflow/react'
import { productionApi, taskFailure } from '../../api/production'
import { tasksApi, type GenerationTask } from '../../api/tasks'
import type { Project } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import type { CanvasNode } from '../canvas/canvasTypes'
import { CanvasRunSession, CanvasRunStoppedError } from '../canvas/runSession'
import {
  productionPlugin,
  type AssetReferences,
  type ProductionNodeData,
  type ProductionNodeResult,
  type ResolvedProductionContext,
} from './catalog'
import { resolveNodeContext } from './contextResolver'

export type NodeUpdater = (id: string, data: Partial<ProductionNodeData>) => void

export async function waitForTask(
  taskId: string,
  onProgress: (task: GenerationTask) => void,
  session?: CanvasRunSession,
): Promise<GenerationTask> {
  await session?.registerTask(taskId)
  try {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      session?.throwIfStopped()
      const task = await tasksApi.get(taskId)
      onProgress(task)
      if (task.status === 'cancelled') throw new CanvasRunStoppedError(task.message || '任务已停止')
      if (task.status === 'completed') return task
      if (task.status === 'failed') throw taskFailure(task, '生产任务失败')
      if (session) await session.wait(2_000)
      else await new Promise((resolve) => window.setTimeout(resolve, 2_000))
    }
    throw new Error('任务轮询超时，请稍后重试')
  } finally {
    session?.clearTask(taskId)
  }
}

export async function executeProductionNode(
  node: CanvasNode,
  project: Project,
  update: NodeUpdater,
  session?: CanvasRunSession,
  context: ResolvedProductionContext = { values: {}, texts: [], images: [], videos: [], assetRefs: node.data.assetRefs },
): Promise<void> {
  session?.throwIfStopped()
  update(node.id, { status: 'running', execution: { progress: 0, message: '正在提交生成请求' }, error: '' })
  const plugin = productionPlugin(node.data.role)
  const command = plugin.buildCommand({ project, data: node.data, context })
  const submission = await productionApi.execute({
    ...command,
    audit: {
      run_id: session?.runId,
      node_id: node.id,
      node_title: node.data.title,
      node_role: node.data.role,
    },
  })
  let result = submission.result || {}
  if (submission.status === 'pending') {
    if (!submission.task_id) throw new Error('后端没有返回任务 ID')
    update(node.id, {
      result: { ...node.data.result, taskId: submission.task_id },
      status: 'pending',
      execution: { progress: 0, message: '任务已提交，等待供应商处理' },
    })
    const task = await waitForTask(submission.task_id, (current) => update(node.id, {
      status: current.status === 'processing' ? 'running' : current.status,
      execution: {
        progress: typeof current.progress === 'number' ? current.progress : undefined,
        message: current.message || (current.status === 'pending' ? '任务排队中' : '供应商生成中'),
      },
    }), session)
    result = taskResult(task)
  }
  session?.throwIfStopped()
  applyResult(node, result, update)
  update(node.id, { status: 'completed', execution: { progress: 100, message: '已完成并保存到本地' }, error: '' })
}

export function prepareNodeForExecution(
  node: CanvasNode,
  nodes: CanvasNode[],
  edges: Array<Pick<Edge, 'source' | 'target'>>,
): { node: CanvasNode; context: ResolvedProductionContext } {
  const context = resolveNodeContext(node, nodes, edges)
  return {
    context,
    node: {
      ...node,
      data: {
        ...node.data,
        assetRefs: context.assetRefs,
      },
    },
  }
}

function applyResult(node: CanvasNode, raw: Record<string, unknown>, update: NodeUpdater): void {
  const plugin = productionPlugin(node.data.role)
  const result: ProductionNodeResult = {
    createdAt: new Date().toISOString(),
    assetRefs: cloneRefs(node.data.assetRefs),
  }
  if (plugin.material === 'text') {
    const direct = raw.text || raw.content || raw.script_content
    const text = typeof direct === 'string' && direct.trim()
      ? direct
      : plugin.resultCollection ? readableItems(raw[plugin.resultCollection.key], plugin.resultCollection.fields) : undefined
    if (text) result.text = text
    if (plugin.outputAssets && plugin.resultCollection) {
      const ids = recordIds(raw[plugin.resultCollection.key])
      if (ids.length) result.assetRefs = { ...result.assetRefs, [plugin.outputAssets]: ids }
    }
  } else {
    const generatedUrl = String(raw.image_url || raw.video_url || '')
    const generationId = Number(raw.generation_id)
    const localPath = typeof raw.local_path === 'string' ? raw.local_path.trim() : ''
    if (!generatedUrl.startsWith('/static/') || !Number.isInteger(generationId) || generationId <= 0 || !localPath) {
      throw new Error('后端没有返回已完成本地归档的媒体结果')
    }
    result.outputUrl = mediaUrl(generatedUrl)
    result.generationId = generationId
    result.localPath = localPath
    result.mediaAvailable = true
  }
  const history = [...(node.data.history || []), result]
  update(node.id, { result, history, assetRefs: result.assetRefs || node.data.assetRefs })
}

function taskResult(task: GenerationTask): Record<string, unknown> {
  if (!task.result) return {}
  if (typeof task.result === 'string') {
    try { return JSON.parse(task.result) as Record<string, unknown> } catch { return { text: task.result } }
  }
  return task.result
}

function recordIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const id = Number((item as Record<string, unknown>).id)
    return Number.isInteger(id) && id > 0 ? [id] : []
  })
}

function readableItems(value: unknown, fields: string[]): string | undefined {
  if (!Array.isArray(value)) return undefined
  const lines = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const parts = fields.map((field) => record[field]).filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    return parts.length ? [`${index + 1}. ${parts.join(' - ')}`] : []
  })
  return lines.length ? lines.join('\n') : undefined
}

function cloneRefs(refs: AssetReferences): AssetReferences {
  return Object.fromEntries(Object.entries(refs).map(([key, values]) => [key, values ? [...values] : values])) as AssetReferences
}
