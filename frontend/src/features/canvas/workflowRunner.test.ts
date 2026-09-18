import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../errors/appError'
import type { Project } from '../../types/domain'
import { createProductionNodeData } from '../production/catalog'
import type { CanvasNode } from './canvasTypes'
import { dependencyRunNodeIds, incompleteRunNodeIds } from './canvasGraph'
import { CanvasRunSession, CanvasRunStoppedError } from './runSession'
import { runWorkflow, WorkflowRunTerminatedError } from './workflowRunner'

function node(id: string): CanvasNode {
  return { id, type: 'canvas', position: { x: 0, y: 0 }, data: createProductionNodeData('story', { parameters: { text: id } }) }
}

describe('画布运行编排', () => {
  it('单节点局部执行只包含目标节点，不自动补跑祖先', () => {
    const story = node('story')
    story.data.status = 'completed'
    const script = node('script')
    const asset = node('asset')
    asset.data.status = 'completed'
    const shot = node('shot')
    const unrelated = node('unrelated')
    const nodes = [story, script, asset, shot, unrelated]
    const edges = [
      { source: story.id, target: script.id },
      { source: script.id, target: shot.id },
      { source: asset.id, target: shot.id },
    ]

    expect(dependencyRunNodeIds([shot.id], nodes, edges)).toEqual([shot.id])
  })

  it('单节点运行范围不因上游媒体状态而扩大', () => {
    const ready = node('ready')
    ready.data = createProductionNodeData('character-asset', {
      status: 'completed',
      result: { generationId: 7, outputUrl: '/static/projects/1/images/7.png', localPath: 'projects/1/images/7.png', mediaAvailable: true },
    })
    const stale = node('stale')
    stale.data = createProductionNodeData('character-asset', {
      status: 'completed',
      result: { generationId: 8, outputUrl: '/static/projects/1/images/8.png', localPath: 'projects/1/images/8.png', mediaAvailable: false },
    })
    const shot = node('shot')
    const edges = [{ source: ready.id, target: shot.id }, { source: stale.id, target: shot.id }]
    expect(dependencyRunNodeIds([shot.id], [ready, stale, shot], edges)).toEqual([shot.id])
  })

  it('整组继续运行会跳过已完成文本，只执行未完成媒体及其缺失依赖', () => {
    const story = node('story')
    story.data.status = 'completed'
    const script = node('script')
    script.data.status = 'completed'
    const image = node('image')
    image.data = createProductionNodeData('character-asset')
    const video = node('video')
    video.data = createProductionNodeData('shot-video')
    const nodes = [story, script, image, video]
    const edges = [
      { source: story.id, target: script.id },
      { source: script.id, target: image.id },
      { source: image.id, target: video.id },
    ]
    expect(incompleteRunNodeIds(nodes.map((item) => item.id), nodes, edges)).toEqual(['image', 'video'])
  })

  it('手动标记完成的节点在所有运行范围中跳过，关闭标记后恢复执行', async () => {
    const skipped = node('skipped')
    skipped.data.manuallyCompleted = true
    const next = node('next')
    next.data = createProductionNodeData('script', { parameters: { text: '只使用自己的面板内容' } })
    const nodes = [skipped, next]
    const executeNode = vi.fn().mockResolvedValue(undefined)
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const edges = [{ id: 'skipped-next', source: skipped.id, target: next.id }]

    expect(incompleteRunNodeIds(nodes.map((item) => item.id), nodes, edges)).toEqual(['next'])
    await expect(runWorkflow({
      ids: nodes.map((item) => item.id),
      label: '整个画布',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes, edges }),
      updateNode: () => undefined,
      executeNode,
    })).resolves.toEqual({ completed: 1 })
    expect(executeNode).toHaveBeenCalledOnce()
    expect(executeNode.mock.calls[0]?.[0].id).toBe('next')
    expect(executeNode.mock.calls[0]?.[4]).toMatchObject({ texts: [], images: [], videos: [] })

    executeNode.mockClear()
    await expect(runWorkflow({
      ids: [skipped.id],
      label: '当前节点',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes, edges }),
      updateNode: () => undefined,
      executeNode,
    })).resolves.toEqual({ completed: 0 })
    expect(executeNode).not.toHaveBeenCalled()

    skipped.data.manuallyCompleted = false
    expect(incompleteRunNodeIds([skipped.id], nodes, edges)).toEqual([skipped.id])
  })

  it('已有成功结果的节点重跑停止后继续保持完成并复用旧结果', async () => {
    const script = node('script')
    script.data.status = 'completed'
    script.data.result = { text: '已经写好的剧本' }
    script.data.execution = {
      message: '已完成并保存到本地',
      startedAt: '2026-09-18T00:00:00.000Z',
      finishedAt: '2026-09-18T00:01:05.000Z',
    }
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const updateNode = (id: string, data: Partial<CanvasNode['data']>) => {
      if (id === script.id) script.data = {
        ...script.data,
        ...data,
        result: data.result ? { ...script.data.result, ...data.result } : script.data.result,
        assetRefs: data.assetRefs ? { ...script.data.assetRefs, ...data.assetRefs } : script.data.assetRefs,
      }
    }

    await expect(runWorkflow({
      ids: [script.id],
      label: '当前节点',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes: [script], edges: [] }),
      updateNode,
      executeNode: vi.fn(async (_node: CanvasNode, _project: Project, update: (id: string, data: Partial<CanvasNode['data']>) => void) => {
        update(script.id, { result: { ...script.data.result, taskId: 'new-task', provider: 'new-provider' } })
        throw new CanvasRunStoppedError()
      }),
    })).rejects.toBeInstanceOf(CanvasRunStoppedError)

    expect(script.data.status).toBe('completed')
    expect(script.data.result.text).toBe('已经写好的剧本')
    expect(script.data.result.taskId).toBeUndefined()
    expect(script.data.result.provider).toBeUndefined()
    expect(script.data.execution?.message).toContain('继续使用已有结果')
    expect(script.data.execution?.startedAt).toBe('2026-09-18T00:00:00.000Z')
    expect(script.data.execution?.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('已有成功结果的节点重跑失败后保留完成态和失败提示', async () => {
    const script = node('script')
    script.data.status = 'completed'
    script.data.result = { text: '已经写好的剧本' }
    script.data.execution = {
      message: '已完成并保存到本地',
      startedAt: '2026-09-18T00:00:00.000Z',
      finishedAt: '2026-09-18T00:01:05.000Z',
    }
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const updateNode = (id: string, data: Partial<CanvasNode['data']>) => {
      if (id === script.id) script.data = {
        ...script.data,
        ...data,
        result: data.result ? { ...script.data.result, ...data.result } : script.data.result,
        assetRefs: data.assetRefs ? { ...script.data.assetRefs, ...data.assetRefs } : script.data.assetRefs,
      }
    }

    await expect(runWorkflow({
      ids: [script.id],
      label: '当前节点',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes: [script], edges: [] }),
      updateNode,
      executeNode: vi.fn(async (_node: CanvasNode, _project: Project, update: (id: string, data: Partial<CanvasNode['data']>) => void) => {
        update(script.id, { result: { ...script.data.result, taskId: 'new-task', model: 'new-model' } })
        throw new Error('供应商暂时不可用')
      }),
    })).rejects.toBeInstanceOf(WorkflowRunTerminatedError)

    expect(script.data.status).toBe('completed')
    expect(script.data.result.text).toBe('已经写好的剧本')
    expect(script.data.result.taskId).toBeUndefined()
    expect(script.data.result.model).toBeUndefined()
    expect(script.data.error).toContain('继续使用已有结果')
    expect(script.data.execution?.startedAt).toBe('2026-09-18T00:00:00.000Z')
    expect(script.data.execution?.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('任一错误都会终止整个运行范围，后续节点不再提交', async () => {
    const nodes = [node('first'), node('failed'), node('never')]
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const executeNode = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppError({ code: 'http_error', message: 'HTTP 429 rate limited', status: 429, retryable: true }))
    const updates: Array<{ id: string; status?: string; error?: string }> = []

    await expect(runWorkflow({
      ids: nodes.map((item) => item.id),
      label: '整个画布',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes, edges: [] }),
      updateNode: (id, data) => updates.push({ id, status: data.status, error: data.error }),
      executeNode,
    })).rejects.toBeInstanceOf(WorkflowRunTerminatedError)

    expect(executeNode).toHaveBeenCalledTimes(2)
    expect(updates.at(-1)).toEqual(expect.objectContaining({
      id: 'failed',
      status: 'failed',
      error: expect.stringContaining('本次整个画布已终止'),
    }))
    expect(updates.some((item) => item.id === 'never')).toBe(false)
  })

  it('未完成的直接上游不会阻止当前节点使用面板参数运行', async () => {
    const upstream = node('资产图')
    upstream.data.title = '资产图'
    const downstream = node('分镜图')
    const executeNode = vi.fn().mockResolvedValue(undefined)
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    await expect(runWorkflow({
      ids: [downstream.id],
      label: '所选节点',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes: [upstream, downstream], edges: [{ id: 'asset-to-shot', source: upstream.id, target: downstream.id }] }),
      updateNode: () => undefined,
      executeNode,
    })).resolves.toEqual({ completed: 1 })
    expect(executeNode).toHaveBeenCalledOnce()
    expect(executeNode.mock.calls[0]?.[4]).toMatchObject({ texts: [], images: [], videos: [] })
  })

  it('运行全部按拓扑顺序共用节点执行主干，并把刚完成的直接上游结果传给下游', async () => {
    const upstream = node('story')
    upstream.data = createProductionNodeData('story', { parameters: { text: '面板故事' } })
    const downstream = node('script')
    downstream.data = createProductionNodeData('script', { parameters: { text: '面板剧本要求' } })
    const nodes = [upstream, downstream]
    const edges = [{ id: 'story-script', source: upstream.id, target: downstream.id }]
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const contexts: string[][] = []
    const updateNode = (id: string, data: Partial<CanvasNode['data']>) => {
      const target = nodes.find((item) => item.id === id)
      if (!target) return
      target.data = {
        ...target.data,
        ...data,
        parameters: data.parameters ? { ...target.data.parameters, ...data.parameters } : target.data.parameters,
        assetRefs: data.assetRefs ? { ...target.data.assetRefs, ...data.assetRefs } : target.data.assetRefs,
        result: data.result ? { ...target.data.result, ...data.result } : target.data.result,
      }
    }
    const executeNode = vi.fn(async (current: CanvasNode, _project, update, _session, context) => {
      contexts.push([...context.texts])
      update(current.id, current.id === upstream.id
        ? { status: 'completed', result: { text: '刚生成的上游故事' } }
        : { status: 'completed', result: { text: '下游剧本' } })
    })

    await expect(runWorkflow({
      ids: nodes.map((item) => item.id),
      label: '整个画布',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes, edges }),
      updateNode,
      executeNode,
    })).resolves.toEqual({ completed: 2 })

    expect(executeNode.mock.calls.map((call) => call[0].id)).toEqual(['story', 'script'])
    expect(contexts).toEqual([[], ['刚生成的上游故事']])
  })

  it('按真实运行范围报告当前节点和完成数量', async () => {
    const nodes = [node('first'), node('second')]
    const progress: Array<{ completed: number; total: number; currentNodeId: string }> = []
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    await runWorkflow({
      ids: nodes.map((item) => item.id),
      label: '整个画布',
      session: new CanvasRunSession(),
      getState: () => ({ project, nodes, edges: [] }),
      updateNode: () => undefined,
      executeNode: vi.fn().mockResolvedValue(undefined),
      onProgress: (value) => progress.push({ completed: value.completed, total: value.total, currentNodeId: value.currentNodeId }),
    })
    expect(progress).toEqual([
      { completed: 0, total: 2, currentNodeId: 'first' },
      { completed: 1, total: 2, currentNodeId: 'first' },
      { completed: 1, total: 2, currentNodeId: 'second' },
      { completed: 2, total: 2, currentNodeId: 'second' },
    ])
  })
})
