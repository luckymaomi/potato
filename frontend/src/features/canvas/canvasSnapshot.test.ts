import { describe, expect, it } from 'vitest'
import type { CanvasNode } from './canvasTypes'
import { createCanvasSnapshot, normalizeCanvasEdges, normalizeCanvasNodes } from './canvasSnapshot'
import { createProductionNodeData } from '../production/catalog'
import type { Project } from '../../types/domain'

describe('createCanvasSnapshot', () => {
  it('只保存画布文档，不把节点和连线选择态写入服务端', () => {
    const node: CanvasNode = {
      id: 'text-1',
      type: 'canvas',
      position: { x: 10, y: 20 },
      selected: true,
      dragging: true,
      data: createProductionNodeData('script', { parameters: { text: '内容' } }),
    }
    const snapshot = createCanvasSnapshot(
      [node],
      [{ id: 'edge-1', source: 'text-1', target: 'image-1', type: 'default', selected: true }],
      [],
    )

    expect(snapshot.workspace_nodes[0]).toEqual({
      id: 'text-1',
      type: 'canvas',
      position: { x: 10, y: 20 },
      data: createProductionNodeData('script', { parameters: { text: '内容' } }),
    })
    expect(snapshot.edges[0]).not.toHaveProperty('selected')
  })

  it('把旧快照中的未知边类型统一恢复为 React Flow 内置默认边', () => {
    expect(normalizeCanvasEdges([
      { id: 'edge-1', source: 'a', target: 'b', type: 'legacy-curve' },
    ])).toEqual([
      { id: 'edge-1', source: 'a', target: 'b', type: 'default', selected: false },
    ])
  })

  it('持久保存并恢复节点的生成起止时间', () => {
    const execution = {
      message: '已完成并保存到本地',
      startedAt: '2026-09-18T00:00:00.000Z',
      finishedAt: '2026-09-18T00:01:05.900Z',
    }
    const node: CanvasNode = {
      id: 'timed-image',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: createProductionNodeData('generic-image', { status: 'completed', execution }),
    }
    const snapshot = createCanvasSnapshot([node], [], [])
    expect(snapshot.workspace_nodes[0]?.data.execution).toEqual(execution)
    expect(normalizeCanvasNodes(snapshot.workspace_nodes)[0]?.data.execution).toEqual(execution)
  })

  it('重新打开时只有当前 generation 与本地文件都有效的媒体节点恢复为完成', () => {
    const mediaNode: CanvasNode = {
      id: 'asset-1',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: createProductionNodeData('character-asset', {
        assetRefs: { characters: [21] },
        status: 'completed',
        result: { outputUrl: '/static/stale.png', generationId: 90 },
      }),
    }
    const project: Project = {
      id: 7,
      title: '生命周期恢复',
      metadata: {},
      canvas_revision: 1,
      characters: [{ id: 21, drama_id: 7, name: '小林', current_image_generation_id: 91 }],
      media_lifecycle: {
        images: {
          '90': { generation_id: 90, status: 'completed', url: '/static/projects/7/images/90.png', local_path: 'projects/7/images/90.png', available: true, failure_stage: null },
        },
        videos: {},
      },
    }
    const restored = normalizeCanvasNodes([mediaNode], project)[0]
    expect(restored?.data).toMatchObject({
      status: 'completed',
      result: { generationId: 90, outputUrl: '/static/projects/7/images/90.png', localPath: 'projects/7/images/90.png', mediaAvailable: true },
    })

    project.media_lifecycle!.images['90']!.available = false
    const missing = normalizeCanvasNodes([mediaNode], project)[0]
    expect(missing?.data).toMatchObject({
      status: 'failed',
      result: { generationId: 90, mediaAvailable: false },
      error: expect.stringContaining('本地媒体文件缺失'),
    })
    expect(missing?.data.result.outputUrl).toBeUndefined()
  })
})
