import { describe, expect, it, vi } from 'vitest'
import { CanvasSaveCoordinator } from './canvasSaveCoordinator'

interface Snapshot { value: string }
interface SavedProject { canvas_revision: number; value: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('CanvasSaveCoordinator', () => {
  it('连续修改只保存最新快照，并让写入严格串行递增 revision', async () => {
    const firstWrite = deferred<SavedProject>()
    const secondWrite = deferred<SavedProject>()
    const persist = vi.fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise)
    const states: string[] = []
    const coordinator = new CanvasSaveCoordinator<Snapshot, SavedProject>({
      initialRevision: 0,
      initialSnapshot: { value: 'initial' },
      debounceMs: 1,
      persist,
      isConflict: () => false,
      onStateChange: (state) => states.push(state),
    })

    coordinator.queue({ value: 'first' })
    const flushing = coordinator.flush()
    await Promise.resolve()
    coordinator.queue({ value: 'latest' })

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenNthCalledWith(1, { value: 'first' }, 0)
    expect(coordinator.hasPendingWrite).toBe(true)

    firstWrite.resolve({ canvas_revision: 1, value: 'first' })
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2))
    expect(persist).toHaveBeenNthCalledWith(2, { value: 'latest' }, 1)
    expect(coordinator.currentState).toBe('saving')

    secondWrite.resolve({ canvas_revision: 2, value: 'latest' })
    await flushing
    expect(coordinator.currentRevision).toBe(2)
    expect(coordinator.currentState).toBe('idle')
    expect(states).toContain('dirty')
    coordinator.dispose()
  })

  it('保存失败保留待写快照，允许用户重试', async () => {
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce({ canvas_revision: 1, value: 'changed' })
    const coordinator = new CanvasSaveCoordinator<Snapshot, SavedProject>({
      initialRevision: 0,
      initialSnapshot: { value: 'initial' },
      persist,
      isConflict: () => false,
    })

    coordinator.queue({ value: 'changed' })
    await expect(coordinator.flush()).rejects.toThrow('网络中断')
    expect(coordinator.currentState).toBe('error')
    expect(coordinator.hasPendingWrite).toBe(true)

    await coordinator.flush()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(coordinator.currentState).toBe('idle')
    coordinator.dispose()
  })

  it('revision 冲突会停止后续覆盖并保留冲突状态', async () => {
    const conflict = Object.assign(new Error('画布已被其他页面更新'), { code: 'CANVAS_REVISION_CONFLICT' })
    const persist = vi.fn().mockRejectedValue(conflict)
    const coordinator = new CanvasSaveCoordinator<Snapshot, SavedProject>({
      initialRevision: 4,
      initialSnapshot: { value: 'initial' },
      persist,
      isConflict: (error) => error === conflict,
    })

    coordinator.queue({ value: 'stale' })
    await expect(coordinator.flush()).rejects.toBe(conflict)
    expect(coordinator.currentState).toBe('conflict')
    expect(coordinator.hasPendingWrite).toBe(true)
    await expect(coordinator.flush()).rejects.toBe(conflict)
    expect(persist).toHaveBeenCalledTimes(1)
    coordinator.dispose()
  })
})
