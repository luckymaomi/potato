import type { Edge } from '@xyflow/react'
import { productionApi, taskFailure, type ProductionCommand } from '../../api/production'
import { tasksApi, type GenerationTask } from '../../api/tasks'
import type { Project } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import type { CanvasNode } from '../canvas/canvasTypes'
import { CanvasRunSession, CanvasRunStoppedError } from '../canvas/runSession'
import {
  assetKindOf,
  materialOf,
  textActionOf,
  type ProductionNodeData,
  type TextAction,
} from './catalog'

export type NodeUpdater = (id: string, data: Partial<ProductionNodeData>) => void

export async function waitForTask(
  taskId: string,
  onProgress: (status: GenerationTask['status']) => void,
  session?: CanvasRunSession,
): Promise<GenerationTask> {
  await session?.registerTask(taskId)
  try {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      session?.throwIfStopped()
      const task = await tasksApi.get(taskId)
      onProgress(task.status)
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
): Promise<void> {
  session?.throwIfStopped()
  update(node.id, { status: 'processing', error: '' })
  const submission = await productionApi.execute(commandFor(node, project))
  let result = submission.result || {}
  if (submission.status === 'pending') {
    if (!submission.task_id) throw new Error('后端没有返回任务 ID')
    update(node.id, { taskId: submission.task_id, status: 'pending' })
    const task = await waitForTask(submission.task_id, (status) => update(node.id, { status }), session)
    result = taskResult(task)
  }
  session?.throwIfStopped()
  applyResult(node, result, update)
  update(node.id, { status: 'completed', error: '' })
}

export function prepareNodeForExecution(node: CanvasNode, nodes: CanvasNode[], edges: Array<Pick<Edge, 'source' | 'target'>>): CanvasNode {
  const sourceIds = edges.filter((edge) => edge.target === node.id).map((edge) => edge.source)
  const sources = sourceIds.flatMap((id) => nodes.find((item) => item.id === id) || [])
  const upstreamText = sources.map((source) => source.data.text?.trim()).find(Boolean)
  const sourceImages = sources
    .filter((source) => materialOf(source.data) === 'image' && source.data.outputUrl)
    .map((source) => source.data.outputUrl as string)
  const generationMode = node.data.generationMode
  const acceptsReferences = generationMode === 'image-to-image' || generationMode === 'image-to-video'
  const referenceImages = acceptsReferences
    ? [...new Set([...(node.data.referenceImages || []), ...sourceImages])]
    : undefined
  const recordSource = linkedRecordSource(node, sources)
  const recordIds = recordSource?.data.linkedRecordIds?.length
    ? recordSource.data.linkedRecordIds
    : recordSource?.data.linkedRecordId ? [recordSource.data.linkedRecordId] : []
  const recordIndex = node.data.linkedRecordIndex ?? 0
  const linkedRecordId = recordIds[recordIndex] ?? recordIds[0] ?? node.data.linkedRecordId

  return {
    ...node,
    data: {
      ...node.data,
      ...(materialOf(node.data) === 'text' && node.data.textMode === 'ai' && upstreamText ? { text: upstreamText } : {}),
      ...(materialOf(node.data) !== 'text' && !String(node.data.prompt || '').trim() && upstreamText ? { prompt: upstreamText } : {}),
      ...(referenceImages ? { referenceImages } : { referenceImages: undefined }),
      ...(linkedRecordId ? { linkedRecordId } : {}),
    },
  }
}

function commandFor(node: CanvasNode, project: Project): ProductionCommand {
  const data = node.data
  const material = materialOf(data)
  if (material === 'text') {
    const text = String(data.text || '').trim()
    if (!text) throw new Error('请先填写文本，或连接一个有文本内容的上游节点')
    if (data.textMode !== 'ai') {
      return {
        kind: 'manual-text',
        project_id: project.id,
        episode_id: data.episodeId,
        text,
        persist_as_script: data.role === 'script',
      }
    }
    return {
      kind: 'ai-text',
      project_id: project.id,
      episode_id: data.episodeId,
      source_text: text,
      action: textActionOf(data),
      system_prompt: data.systemPrompt,
      storyboard_count: data.storyboardCount,
      provider: data.provider,
      model: data.model,
    }
  }

  const prompt = String(data.prompt || '').trim()
  if (!prompt) throw new Error('请先填写提示词，或连接一个有文本内容的上游节点')
  const references = data.referenceImages || []
  if ((data.generationMode === 'image-to-image' || data.generationMode === 'image-to-video') && !references.length) {
    throw new Error(data.generationMode === 'image-to-image'
      ? '图生图需要连接上游资产图或添加参考图'
      : '图生视频需要连接上游分镜图或添加参考图')
  }
  if (material === 'image') {
    const mode = data.generationMode === 'image-to-image' ? 'image-to-image' : 'text-to-image'
    const kind = assetKindOf(data)
    const target = data.linkedRecordId
      ? { kind: data.role === 'storyboard-image' ? 'storyboard' as const : kind, id: data.linkedRecordId }
      : undefined
    return {
      kind: 'image',
      project_id: project.id,
      prompt,
      mode,
      provider: data.provider,
      model: data.model,
      aspect_ratio: data.aspectRatio,
      reference_images: mode === 'image-to-image' ? references : [],
      target: target?.kind ? target as NonNullable<Extract<ProductionCommand, { kind: 'image' }>['target']> : undefined,
    }
  }
  const mode = data.generationMode === 'image-to-video' ? 'image-to-video' : 'text-to-video'
  return {
    kind: 'video',
    project_id: project.id,
    prompt,
    mode,
    provider: data.provider,
    model: data.model,
    aspect_ratio: data.aspectRatio,
    duration: Number(data.duration) || 5,
    reference_images: mode === 'image-to-video' ? references : [],
    storyboard_id: data.role === 'shot-video' ? data.linkedRecordId : undefined,
  }
}

function applyResult(node: CanvasNode, result: Record<string, unknown>, update: NodeUpdater): void {
  if (materialOf(node.data) === 'text') {
    const action = textActionOf(node.data)
    const text = generatedText(action, result)
    const linkedRecordIds = generatedRecordIds(action, result)
    if (text || linkedRecordIds.length) update(node.id, {
      ...(text ? { text } : {}),
      ...(linkedRecordIds.length ? { linkedRecordId: linkedRecordIds[0], linkedRecordIds } : {}),
    })
    return
  }
  const generatedUrl = String(result.image_url || result.video_url || '')
  if (generatedUrl) update(node.id, { outputUrl: mediaUrl(generatedUrl) })
}

function taskResult(task: GenerationTask): Record<string, unknown> {
  if (!task.result) return {}
  if (typeof task.result === 'string') {
    try { return JSON.parse(task.result) as Record<string, unknown> } catch { return { text: task.result } }
  }
  return task.result
}

function generatedText(action: TextAction, result: Record<string, unknown>): string | undefined {
  const direct = result.text || result.content || result.script_content
  if (typeof direct === 'string' && direct.trim()) return direct
  if (action === 'extract-characters') return readableItems(result.characters, ['name', 'description', 'appearance'])
  if (action === 'extract-scenes') return readableItems(result.scenes, ['location', 'prompt'])
  if (action === 'extract-props') return readableItems(result.props, ['name', 'description', 'prompt'])
  if (action === 'split-storyboards') return readableItems(result.storyboards, ['title', 'description', 'action', 'dialogue', 'image_prompt', 'video_prompt'])
  return undefined
}

export function generatedRecordIds(action: TextAction, result: Record<string, unknown>): number[] {
  const collection = action === 'extract-characters'
    ? result.characters
    : action === 'extract-scenes'
      ? result.scenes
      : action === 'extract-props'
        ? result.props
        : action === 'split-storyboards' ? result.storyboards : undefined
  if (!Array.isArray(collection)) return []
  return collection.flatMap((item) => {
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

function linkedRecordSource(node: CanvasNode, sources: CanvasNode[]): CanvasNode | undefined {
  if (node.data.role === 'storyboard-image') return sources.find((source) => source.data.role === 'storyboard-plan')
  if (node.data.role === 'shot-video') {
    return sources.find((source) => source.data.role === 'storyboard-image')
      || sources.find((source) => source.data.role === 'storyboard-plan')
  }
  const kind = assetKindOf(node.data)
  if (kind) return sources.find((source) => assetKindOf(source.data) === kind && source.data.role.endsWith('-extraction'))
  return undefined
}
