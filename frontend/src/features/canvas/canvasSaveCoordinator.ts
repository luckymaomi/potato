export type CanvasSaveState = 'idle' | 'dirty' | 'saving' | 'error' | 'conflict'

interface RevisionedResult {
  canvas_revision: number
}

interface PendingSnapshot<TSnapshot> {
  value: TSnapshot
  fingerprint: string
}

export interface CanvasSaveCoordinatorOptions<TSnapshot, TResult extends RevisionedResult> {
  initialRevision: number
  initialSnapshot: TSnapshot
  persist: (snapshot: TSnapshot, expectedRevision: number) => Promise<TResult>
  isConflict: (error: unknown) => boolean
  onStateChange?: (state: CanvasSaveState, error: unknown | null) => void
  onSaved?: (result: TResult) => void
  debounceMs?: number
}

export class CanvasSaveCoordinator<TSnapshot, TResult extends RevisionedResult> {
  private revision: number
  private savedFingerprint: string
  private pending: PendingSnapshot<TSnapshot> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private writePromise: Promise<void> | null = null
  private state: CanvasSaveState = 'idle'
  private error: unknown | null = null
  private disposed = false
  private readonly options: CanvasSaveCoordinatorOptions<TSnapshot, TResult>

  constructor(options: CanvasSaveCoordinatorOptions<TSnapshot, TResult>) {
    this.options = options
    this.revision = options.initialRevision
    this.savedFingerprint = fingerprint(options.initialSnapshot)
  }

  get currentState(): CanvasSaveState {
    return this.state
  }

  get currentRevision(): number {
    return this.revision
  }

  get currentError(): unknown | null {
    return this.error
  }

  get hasPendingWrite(): boolean {
    return this.pending !== null || this.writePromise !== null
  }

  queue(snapshot: TSnapshot): void {
    if (this.disposed) return
    const next = cloneSnapshot(snapshot)
    const nextFingerprint = fingerprint(next)

    if (!this.writePromise && nextFingerprint === this.savedFingerprint) {
      this.pending = null
      this.clearTimer()
      this.setState('idle', null)
      return
    }
    if (this.pending?.fingerprint === nextFingerprint) return

    this.pending = { value: next, fingerprint: nextFingerprint }
    if (this.state === 'conflict') return
    this.setState('dirty', null)
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch(() => undefined)
    }, this.options.debounceMs ?? 700)
  }

  async flush(): Promise<void> {
    this.clearTimer()
    if (this.writePromise) await this.writePromise
    if (this.state === 'conflict') {
      if (this.error) throw this.error
      return
    }
    if (!this.pending) return

    const write = async () => {
      while (this.pending && this.state !== 'conflict') {
        const snapshot = this.pending
        this.pending = null
        if (snapshot.fingerprint === this.savedFingerprint) {
          this.setState(this.pending ? 'dirty' : 'idle', null)
          continue
        }

        this.setState('saving', null)
        try {
          const result = await this.options.persist(snapshot.value, this.revision)
          if (!Number.isInteger(result.canvas_revision) || result.canvas_revision <= this.revision) {
            throw new Error('服务端返回了无效的画布 revision')
          }
          this.revision = result.canvas_revision
          this.savedFingerprint = snapshot.fingerprint
          this.options.onSaved?.(result)
          this.setState(this.pending ? 'dirty' : 'idle', null)
        } catch (error) {
          if (!this.pending) this.pending = snapshot
          this.setState(this.options.isConflict(error) ? 'conflict' : 'error', error)
          throw error
        }
      }
    }

    this.writePromise = write().finally(() => {
      this.writePromise = null
    })
    await this.writePromise
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private setState(state: CanvasSaveState, error: unknown | null): void {
    if (this.state === state && this.error === error) return
    this.state = state
    this.error = error
    this.options.onStateChange?.(state, error)
  }
}

function cloneSnapshot<TSnapshot>(snapshot: TSnapshot): TSnapshot {
  return structuredClone(snapshot)
}

function fingerprint(snapshot: unknown): string {
  return JSON.stringify(snapshot)
}
