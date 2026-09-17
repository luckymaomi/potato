import { afterEach, describe, expect, it, vi } from 'vitest'
import { tasksApi } from '../../api/tasks'
import { CanvasRunSession, CanvasRunStoppedError } from './runSession'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('画布运行会话', () => {
  it('停止时取消当前后端任务并保持停止信号', async () => {
    const cancel = vi.spyOn(tasksApi, 'cancel').mockResolvedValue({
      id: 'task-1', type: 'image_generation', status: 'cancelled',
    })
    const session = new CanvasRunSession()
    await session.registerTask('task-1')

    await session.stop()

    expect(session.stopped).toBe(true)
    expect(cancel).toHaveBeenCalledWith('task-1', '用户停止了画布运行')
    expect(() => session.throwIfStopped()).toThrow(CanvasRunStoppedError)
  })

  it('停止会立即结束轮询等待', async () => {
    const session = new CanvasRunSession()
    const rejected = expect(session.wait(10_000)).rejects.toBeInstanceOf(CanvasRunStoppedError)

    await session.stop()

    await rejected
  })
})
