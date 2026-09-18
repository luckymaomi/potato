import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../errors/appError'
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
      const startedAt = updates[0]?.execution?.startedAt
      expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
      expect(updates[0]?.execution).toEqual({ message: '正在提交生成请求', startedAt })
      expect(updates[1]?.execution).toEqual({ message: '任务已提交，等待供应商处理', startedAt })
      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({ execution: { progress: undefined, message: '供应商生成中', startedAt } }),
        expect.objectContaining({ execution: { progress: 42, message: '供应商返回实际进度', startedAt } }),
      ]))
      const completed = updates.find((item) => item.status === 'completed')
      expect(completed?.execution).toMatchObject({ progress: 100, message: '已完成并保存到本地', startedAt })
      expect(completed?.execution?.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
      expect(Date.parse(completed?.execution?.finishedAt || '')).toBeGreaterThanOrEqual(Date.parse(startedAt || ''))
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('前端任务状态查询暂时失败时继续等待，不把供应商任务改成失败', async () => {
    const node: CanvasNode = {
      id: 'image-retry',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: createProductionNodeData('generic-image', { parameters: { prompt: '雨夜', method: 'text-to-image', aspectRatio: '9:16' } }),
    }
    const project: Project = { id: 1, title: '测试', metadata: {}, canvas_revision: 0 }
    const updates: Array<Partial<ProductionNodeData>> = []
    const session = new CanvasRunSession()
    vi.spyOn(session, 'wait').mockResolvedValue()
    vi.spyOn(productionApi, 'execute').mockResolvedValue({ status: 'pending', task_id: 'task-retry' })
    vi.spyOn(tasksApi, 'get')
      .mockRejectedValueOnce(new AppError({ code: 'NETWORK_ERROR', message: 'fetch failed', retryable: true }))
      .mockResolvedValueOnce({
        id: 'task-retry', type: 'image_generation', status: 'completed', progress: 100, message: '任务完成',
        result: { image_url: '/static/projects/1/images/2.png', generation_id: 2, local_path: 'projects/1/images/2.png' },
      })
    try {
      await expect(executeProductionNode(node, project, (_id, data) => updates.push(data), session)).resolves.toBeUndefined()
      expect(tasksApi.get).toHaveBeenCalledTimes(2)
      expect(updates.at(-1)?.status).toBe('completed')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
