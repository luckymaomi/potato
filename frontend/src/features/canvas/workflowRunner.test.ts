import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../errors/appError'
import type { Project } from '../../types/domain'
import { createProductionNodeData } from '../production/catalog'
import type { CanvasNode } from './canvasTypes'
import { dependencyRunNodeIds, incompleteRunNodeIds } from './canvasGraph'
import { CanvasRunSession } from './runSession'
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
})
