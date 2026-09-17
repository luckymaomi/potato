import { tasksApi } from '../../api/tasks'

export class CanvasRunStoppedError extends Error {
  constructor(message = '运行已停止') {
    super(message)
    this.name = 'CanvasRunStoppedError'
  }
}

export class CanvasRunSession {
  private readonly controller = new AbortController()
  private activeTaskId: string | null = null
  readonly runId = globalThis.crypto.randomUUID()

  get signal(): AbortSignal {
    return this.controller.signal
  }

  get stopped(): boolean {
    return this.signal.aborted
  }

  async registerTask(taskId: string): Promise<void> {
    this.activeTaskId = taskId
    if (this.stopped) await this.cancelTask(taskId)
  }

  clearTask(taskId: string): void {
    if (this.activeTaskId === taskId) this.activeTaskId = null
  }

  throwIfStopped(): void {
    if (this.stopped) throw new CanvasRunStoppedError()
  }

  async stop(): Promise<void> {
    if (!this.stopped) this.controller.abort(new CanvasRunStoppedError())
    if (this.activeTaskId) await this.cancelTask(this.activeTaskId)
  }

  async wait(milliseconds: number): Promise<void> {
    this.throwIfStopped()
    await new Promise<void>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.signal.removeEventListener('abort', abort)
        resolve()
      }, milliseconds)
      const abort = () => {
        globalThis.clearTimeout(timer)
        this.signal.removeEventListener('abort', abort)
        reject(new CanvasRunStoppedError())
      }
      this.signal.addEventListener('abort', abort, { once: true })
    })
  }

  private async cancelTask(taskId: string): Promise<void> {
    await tasksApi.cancel(taskId, '用户停止了画布运行')
  }
}
