import type { Edge } from '@xyflow/react'
import { charactersApi, propsApi, scenesApi } from '../../api/assets'
import { generationApi } from '../../api/generation'
import { imagesApi, videosApi } from '../../api/media'
import { storyboardsApi } from '../../api/storyboards'
import { tasksApi, type GenerationTask } from '../../api/tasks'
import { mediaUrl } from '../../utils/mediaUrl'
import type { Project } from '../../types/domain'
import type { CanvasNode, CanvasNodeData } from '../../store/workbenchStore'

export type NodeUpdater = (id: string, data: Partial<CanvasNodeData>) => void

function taskResult(task: GenerationTask): Record<string, unknown> {
  if (!task.result) return {}
  if (typeof task.result === 'string') {
    try { return JSON.parse(task.result) as Record<string, unknown> } catch { return { text: task.result } }
  }
  return task.result
}

export async function waitForTask(taskId: string, onProgress: (status: GenerationTask['status']) => void): Promise<GenerationTask> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const task = await tasksApi.get(taskId)
    onProgress(task.status)
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task
    await new Promise((resolve) => window.setTimeout(resolve, 2000))
  }
  throw new Error('任务轮询超时，请稍后重试')
}

function completedTask(task: GenerationTask, fallback: string): Record<string, unknown> {
  if (task.status !== 'completed') throw new Error(String(task.error || task.message || fallback))
  return taskResult(task)
}

function readableItems(value: unknown, fields: string[]): string | undefined {
  if (!Array.isArray(value)) return undefined
  const lines = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const parts = fields
      .map((field) => record[field])
      .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    return parts.length ? [`${index + 1}. ${parts.join(' - ')}`] : []
  })
  return lines.length ? lines.join('\n') : undefined
}

function generatedText(action: string, result: Record<string, unknown>): string | undefined {
  const direct = result.text || result.content || result.script_content
  if (typeof direct === 'string' && direct.trim()) return direct
  if (action === 'characters') return readableItems(result.characters, ['name', 'description', 'appearance'])
  if (action === 'scenes') return readableItems(result.scenes, ['location', 'prompt'])
  if (action === 'props') return readableItems(result.props, ['name', 'description', 'prompt'])
  return undefined
}

export function generatedEntityId(action: string, result: Record<string, unknown>): number | undefined {
  const collection = action === 'characters'
    ? result.characters
    : action === 'scenes'
      ? result.scenes
      : action === 'props'
        ? result.props
        : undefined
  if (!Array.isArray(collection) || !collection.length) return undefined
  const first = collection[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return undefined
  const id = Number((first as Record<string, unknown>).id)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

async function runText(node: CanvasNode, project: Project, update: NodeUpdater) {
  const data = node.data
  if (data.mode === 'manual') return
  const episodeId = Number(data.episodeId)
  const action = String(data.apiAction || 'story')
  let response: { task_id?: string } | undefined
  if (action === 'story') response = await generationApi.story({
    drama_id: project.id,
    episode_id: Number.isFinite(episodeId) ? episodeId : undefined,
    outline: data.text || '',
    model: data.model,
    provider: data.provider,
  })
  const textConfig = { model: data.model, provider: data.provider }
  if (action === 'characters' && Number.isFinite(episodeId)) response = await generationApi.extractCharacters(episodeId, textConfig)
  if (action === 'scenes' && Number.isFinite(episodeId)) response = await generationApi.extractScenes(episodeId, textConfig)
  if (action === 'props' && Number.isFinite(episodeId)) response = await generationApi.extractProps(episodeId, textConfig)
  if (!response) throw new Error('这个 AI 动作需要关联一个剧集')
  if (!response.task_id) throw new Error('后端没有返回文本任务 ID')
  const task = await waitForTask(response.task_id, (status) => update(node.id, { status: status as CanvasNodeData['status'] }))
  const result = completedTask(task, '文本任务失败')
  const text = generatedText(action, result)
  const entityId = generatedEntityId(action, result)
  if (text || entityId) update(node.id, { ...(text ? { text } : {}), ...(entityId ? { entityId } : {}) })
}

async function runStoryboard(node: CanvasNode, update: NodeUpdater) {
  const episodeId = Number(node.data.episodeId)
  if (!Number.isFinite(episodeId)) throw new Error('生成分镜前需要关联一个剧集')
  const response = await storyboardsApi.generate(episodeId, { model: node.data.model, provider: node.data.provider })
  if (!response.task_id) throw new Error('后端没有返回分镜任务 ID')
  const task = await waitForTask(response.task_id, (status) => update(node.id, { status: status as CanvasNodeData['status'] }))
  const result = completedTask(task, '分镜生成失败')
  const prompt = readableItems(result.storyboards, ['title', 'description', 'action', 'image_prompt', 'video_prompt'])
  const firstStoryboard = Array.isArray(result.storyboards) && result.storyboards[0] && typeof result.storyboards[0] === 'object'
    ? result.storyboards[0] as Record<string, unknown>
    : undefined
  const entityId = Number(firstStoryboard?.id)
  update(node.id, {
    ...(prompt ? { prompt } : {}),
    ...(Number.isFinite(entityId) ? { entityId } : {}),
  })
}

async function runMedia(node: CanvasNode, project: Project, update: NodeUpdater) {
  const data = node.data
  const prompt = String(data.prompt || data.text || '').trim()
  if (!prompt) throw new Error('请先填写提示词，或连接一个有文本内容的上游节点')
  let taskId = ''
  let generationId: number | undefined
  const refs = data.referenceImages || []
  if ((data.mode === 'image-to-image' || data.mode === 'image-to-video') && !refs.length) {
    throw new Error(data.mode === 'image-to-image' ? '图生图需要连接上游图片或添加参考图' : '图生视频需要连接上游图片或添加参考图')
  }
  const videoMode = data.preset === 'video'
    || (data.preset === 'storyboard' && (data.mode === 'text-to-video' || data.mode === 'image-to-video'))

  if (data.preset === 'character' && data.entityId) {
    taskId = (await charactersApi.generateImage(data.entityId, { model: data.model, provider: data.provider })).image_generation?.task_id || ''
  } else if (data.preset === 'scene' && data.entityId) {
    taskId = (await scenesApi.generateImage(data.entityId, { model: data.model, provider: data.provider })).image_generation?.task_id || ''
  } else if (data.preset === 'prop' && data.entityId) {
    taskId = (await propsApi.generateImage(data.entityId, { model: data.model, provider: data.provider })).task_id || ''
  } else if (videoMode) {
    const result = await videosApi.create({
      drama_id: project.id,
      storyboard_id: data.entityId || null,
      prompt,
      model: data.model,
      provider: data.provider,
      duration: Number(data.duration) || 5,
      aspect_ratio: String(data.aspectRatio || '16:9'),
      image_url: refs[0],
      first_frame_url: refs[0],
      reference_image_urls: refs,
    })
    taskId = result.task_id || ''
    generationId = result.id
  } else {
    const result = await imagesApi.create({
      drama_id: project.id,
      storyboard_id: data.preset === 'storyboard' ? data.entityId || null : null,
      prompt,
      model: data.model,
      provider: data.provider,
      aspect_ratio: String(data.aspectRatio || '16:9'),
      reference_images: data.mode === 'image-to-image' ? refs : [],
    })
    taskId = result.task_id || ''
    generationId = result.id
  }
  if (!taskId) throw new Error('后端没有返回任务 ID')
  update(node.id, { taskId, status: 'pending', error: '' })
  const task = await waitForTask(taskId, (status) => update(node.id, { status: status as CanvasNodeData['status'] }))
  const result = completedTask(task, '生成失败')
  let generatedUrl = String(result.image_url || result.video_url || '')
  if (generationId) {
    if (videoMode) {
      const record = await videosApi.get(generationId)
      generatedUrl = record.video_url || record.local_path || generatedUrl
    } else {
      const record = await imagesApi.get(generationId)
      generatedUrl = record.image_url || record.local_path || generatedUrl
    }
  }
  update(node.id, {
    status: 'completed',
    mediaUrl: generatedUrl ? mediaUrl(generatedUrl) : undefined,
    mediaKind: videoMode ? 'video' : 'image',
    error: '',
  })
}

export async function executeCanvasNode(node: CanvasNode, project: Project, update: NodeUpdater) {
  update(node.id, { status: 'processing', error: '' })
  if (node.data.preset === 'text') await runText(node, project, update)
  else if (node.data.preset === 'storyboard' && (!node.data.mode || node.data.mode === 'storyboard')) await runStoryboard(node, update)
  else await runMedia(node, project, update)
  update(node.id, { status: 'completed', error: '' })
}

export function downstreamNodeIds(startIds: string[], edges: Array<Pick<Edge, 'source' | 'target'>>): string[] {
  const visited = new Set(startIds)
  const queue = [...startIds]
  while (queue.length) {
    const source = queue.shift() as string
    for (const edge of edges) {
      if (edge.source !== source || visited.has(edge.target)) continue
      visited.add(edge.target)
      queue.push(edge.target)
    }
  }
  return [...visited]
}

export function orderByConnections(nodes: CanvasNode[], edges: Array<Pick<Edge, 'source' | 'target'>>, selectedIds: string[]) {
  const selected = new Set(selectedIds)
  const nodeMap = new Map(nodes.filter((node) => selected.has(node.id)).map((node) => [node.id, node]))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  nodeMap.forEach((_, id) => { incoming.set(id, 0); outgoing.set(id, []) })
  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })
  const queue = [...nodeMap.keys()].filter((id) => incoming.get(id) === 0)
  const ordered: CanvasNode[] = []
  while (queue.length) {
    const id = queue.shift() as string
    ordered.push(nodeMap.get(id) as CanvasNode)
    outgoing.get(id)?.forEach((target) => {
      const next = (incoming.get(target) || 0) - 1
      incoming.set(target, next)
      if (next === 0) queue.push(target)
    })
  }
  if (ordered.length < nodeMap.size) throw new Error('运行范围中存在循环连线，请先删除形成闭环的连线')
  return ordered
}

export function prepareNodeForExecution(node: CanvasNode, nodes: CanvasNode[], edges: Array<Pick<Edge, 'source' | 'target'>>): CanvasNode {
  const sourceIds = edges.filter((edge) => edge.target === node.id).map((edge) => edge.source)
  const sources = nodes.filter((source) => sourceIds.includes(source.id))
  const upstreamText = sources
    .map((source) => String(source.data.text || source.data.prompt || '').trim())
    .filter(Boolean)
    .join('\n\n')
  const upstreamImages = sources
    .filter((source) => source.data.mediaUrl && source.data.mediaKind !== 'video')
    .map((source) => String(source.data.mediaUrl))
  const needsReferences = node.data.mode === 'image-to-image' || node.data.mode === 'image-to-video'
  const existingReferences = node.data.referenceImages || []
  const references = [...new Set([...existingReferences, ...(needsReferences ? upstreamImages : [])])]
  const preferredEntitySource = node.data.preset === 'storyboard'
    ? sources.find((source) => source.data.preset === 'storyboard' && source.data.mode === 'storyboard')
    : undefined
  const upstreamEntityId = Number(preferredEntitySource?.data.entityId)
    || sources.map((source) => Number(source.data.entityId)).find((id) => Number.isInteger(id) && id > 0)
  const data: CanvasNodeData = {
    ...node.data,
    ...(node.data.preset === 'text' && !String(node.data.text || '').trim() && upstreamText ? { text: upstreamText } : {}),
    ...(node.data.preset !== 'text' && !String(node.data.prompt || '').trim() && upstreamText ? { prompt: upstreamText } : {}),
    ...(needsReferences && references.length ? { referenceImages: references } : {}),
    ...(!node.data.entityId && upstreamEntityId ? { entityId: upstreamEntityId } : {}),
  }
  return { ...node, data }
}
