import { describe, expect, it, vi } from 'vitest'
import { productionApi } from '../../api/production'
import { tasksApi } from '../../api/tasks'
import type { Project } from '../../types/domain'
import { CanvasRunSession } from '../canvas/runSession'
import type { CanvasNode } from '../canvas/canvasTypes'
import { createProductionNodeData, type ProductionNodeData } from './catalog'
import { executeProductionNode } from './executor'

describe('生产节点任务进度', () => {
  it('未知进度只写阶段，供应商明确给出的百分比才写回节点', async () => {
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
      .mockResolvedValueOnce({ id: 'task-1', type: 'image_generation', status: 'processing', message: '供应商生成中' })
      .mockResolvedValueOnce({ id: 'task-1', type: 'image_generation', status: 'processing', progress: 42, message: '供应商返回实际进度' })
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
      expect(updates[0]?.execution).toEqual({ message: '正在提交生成请求' })
      expect(updates[1]?.execution).toEqual({ message: '任务已提交，等待供应商处理' })
      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({ execution: { progress: undefined, message: '供应商生成中' } }),
        expect.objectContaining({ execution: { progress: 42, message: '供应商返回实际进度' } }),
        expect.objectContaining({ status: 'completed', execution: { progress: 100, message: '已完成并保存到本地' } }),
      ]))
    } finally {
      vi.restoreAllMocks()
    }
  })
})
