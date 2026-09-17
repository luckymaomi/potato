import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../errors/appError'
import type { Project } from '../../types/domain'
import { createProductionNodeData } from '../production/catalog'
import type { CanvasNode } from './canvasTypes'
import { CanvasRunSession } from './runSession'
import { runWorkflow, WorkflowRunTerminatedError } from './workflowRunner'

function node(id: string): CanvasNode {
  return { id, type: 'canvas', position: { x: 0, y: 0 }, data: createProductionNodeData('story', { text: id }) }
}

describe('画布运行编排', () => {
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
})
