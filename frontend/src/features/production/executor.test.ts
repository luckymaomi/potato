import { describe, expect, it, vi } from 'vitest'
import { productionApi } from '../../api/production'
import { tasksApi } from '../../api/tasks'
import type { Project } from '../../types/domain'
import { CanvasRunSession } from '../canvas/runSession'
import type { CanvasNode } from '../canvas/canvasTypes'
import { createProductionNodeData, type ProductionNodeData } from './catalog'
import { executeProductionNode } from './executor'

describe('生产节点任务进度', () => {
  it('把后端真实百分比和阶段消息写回节点', async () => {
    const node: CanvasNode = {
      id: 'image',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: createProductionNodeData('generic-image', { parameters: { prompt: '雨夜', method: 'text-to-image', aspectRatio: '9:16' } }),
    }
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const updates: Array<Partial<ProductionNodeData>> = []
    const session = new CanvasRunSession()
    vi.spyOn(session, 'wait').mockResolvedValue()
    vi.spyOn(productionApi, 'execute').mockResolvedValue({ status: 'pending', task_id: 'task-1' })
    vi.spyOn(tasksApi, 'get')
      .mockResolvedValueOnce({ id: 'task-1', type: 'image_generation', status: 'processing', progress: 5, message: '正在提交图片生成' })
      .mockResolvedValueOnce({ id: 'task-1', type: 'image_generation', status: 'processing', progress: 85, message: '供应商生成完成，正在保存到本地' })
      .mockResolvedValueOnce({
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        message: '任务完成',
        result: { image_url: '/static/projects/1/images/1.png', generation_id: 1, local_path: 'projects/1/images/1.png' },
      })
    try {
      await executeProductionNode(node, project, (_id, data) => updates.push(data), session)
      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({ execution: { progress: 5, message: '正在提交图片生成' } }),
        expect.objectContaining({ execution: { progress: 85, message: '供应商生成完成，正在保存到本地' } }),
        expect.objectContaining({ status: 'completed', execution: { progress: 100, message: '已完成并保存到本地' } }),
      ]))
    } finally {
      vi.restoreAllMocks()
    }
  })
})
