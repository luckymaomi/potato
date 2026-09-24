import { useCallback, useEffect, useRef, useState } from 'react'

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const DEFAULT_DELAY_MS = 2000

/** 编辑停顿后防抖落盘；切换对象或离开前可 flush。成功不弹 toast。 */
export function useDebouncedAutoSave(
  save: () => Promise<void>,
  options?: { delayMs?: number; enabled?: boolean },
) {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS
  const enabled = options?.enabled ?? true
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const saveRef = useRef(save)
  const dirtyRef = useRef(false)
  const inFlightRef = useRef(false)
  const queuedRef = useRef(false)
  const generationRef = useRef(0)

  saveRef.current = save

  const runSave = useCallback(async () => {
    if (!enabled) return
    if (inFlightRef.current) {
      queuedRef.current = true
      return
    }
    if (!dirtyRef.current) return

    inFlightRef.current = true
    dirtyRef.current = false
    const generation = generationRef.current
    setStatus('saving')
    try {
      await saveRef.current()
      if (generation !== generationRef.current) return
      if (dirtyRef.current) setStatus('pending')
      else setStatus('saved')
    } catch (reason) {
      if (generation === generationRef.current) {
        dirtyRef.current = true
        setStatus('error')
      }
      throw reason
    } finally {
      inFlightRef.current = false
      if (queuedRef.current && generation === generationRef.current) {
        queuedRef.current = false
        void runSave().catch(() => undefined)
      }
    }
  }, [enabled])

  const schedule = useCallback(() => {
    if (!enabled) return
    dirtyRef.current = true
    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void runSave().catch(() => undefined)
    }, delayMs)
  }, [delayMs, enabled, runSave])

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    if (!enabled || (!dirtyRef.current && !inFlightRef.current && !queuedRef.current)) return
    await runSave()
  }, [enabled, runSave])

  const reset = useCallback(() => {
    generationRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    dirtyRef.current = false
    queuedRef.current = false
    setStatus('idle')
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { status, schedule, flush, reset, saving: status === 'saving' }
}

export function autoSaveLabel(status: AutoSaveStatus): string {
  switch (status) {
    case 'pending':
      return '待保存…'
    case 'saving':
      return '保存中…'
    case 'saved':
      return '已自动保存'
    case 'error':
      return '保存失败'
    default:
      return '自动保存'
  }
}
