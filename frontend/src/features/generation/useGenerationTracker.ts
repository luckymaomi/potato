import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaHistoryApi, type MediaGenerationHistory } from '../../api/media'
import { tasksApi, type GenerationTask, type GenerationTaskStatus } from '../../api/tasks'

export type GenerationTrackKey = string

export interface TrackedGeneration {
  key: GenerationTrackKey
  taskId: string
  generationId?: number
  kind: 'image' | 'video'
  label?: string
  startedAt: string
  finishedAt?: string
  status: GenerationTaskStatus
  progress?: number
  message?: string
}

const activeStatuses = new Set(['pending', 'processing'])

export function assetImageKey(assetId: number): GenerationTrackKey {
  return `asset:${assetId}:image`
}

export function storyboardImageKey(storyboardId: number): GenerationTrackKey {
  return `storyboard:${storyboardId}:image`
}

export function storyboardVideoKey(storyboardId: number): GenerationTrackKey {
  return `storyboard:${storyboardId}:video`
}

export function useGenerationTracker(projectId: number) {
  const [tracks, setTracks] = useState<Record<string, TrackedGeneration>>({})
  const pollers = useRef(new Map<string, AbortController>())
  const tracksRef = useRef(tracks)

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  const upsert = useCallback((track: TrackedGeneration) => {
    setTracks((current) => {
      const next = { ...current, [track.key]: track }
      tracksRef.current = next
      return next
    })
  }, [])

  const stopPolling = useCallback((key: string) => {
    pollers.current.get(key)?.abort()
    pollers.current.delete(key)
  }, [])

  const pollTask = useCallback((track: TrackedGeneration) => {
    stopPolling(track.key)
    const controller = new AbortController()
    pollers.current.set(track.key, controller)

    void (async () => {
      try {
        for (;;) {
          if (controller.signal.aborted) return
          const task = await tasksApi.get(track.taskId)
          if (controller.signal.aborted) return
          const next = applyTask(track, task)
          upsert(next)
          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            stopPolling(track.key)
            return
          }
          await sleep(1_000, controller.signal)
        }
      } catch {
        if (!controller.signal.aborted) {
          upsert({ ...track, status: 'failed', finishedAt: track.finishedAt ?? new Date().toISOString(), message: '任务轮询失败' })
          stopPolling(track.key)
        }
      }
    })()
  }, [stopPolling, upsert])

  const watch = useCallback((input: {
    key: GenerationTrackKey
    taskId: string
    generationId?: number
    kind: 'image' | 'video'
    label?: string
    startedAt?: string
  }) => {
    const track: TrackedGeneration = {
      key: input.key,
      taskId: input.taskId,
      generationId: input.generationId,
      kind: input.kind,
      label: input.label,
      startedAt: input.startedAt ?? new Date().toISOString(),
      status: 'processing',
      message: '正在生成',
    }
    upsert(track)
    pollTask(track)
    return track
  }, [pollTask, upsert])

  const cancel = useCallback(async (key: GenerationTrackKey, reason = '用户停止') => {
    const track = tracksRef.current[key]
    if (!track?.taskId) return
    try {
      const task = await tasksApi.cancel(track.taskId, reason)
      upsert(applyTask(track, task))
    } catch {
      upsert({ ...track, status: 'cancelled', finishedAt: new Date().toISOString(), message: reason })
    } finally {
      stopPolling(key)
    }
  }, [stopPolling, upsert])

  const waitForTerminal = useCallback(async (key: GenerationTrackKey): Promise<TrackedGeneration | undefined> => {
    for (;;) {
      const track = tracksRef.current[key]
      if (track && !activeStatuses.has(track.status)) return track
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100))
    }
  }, [])

  const resumeFromHistory = useCallback(async () => {
    const [images, videos] = await Promise.all([
      mediaHistoryApi.images(projectId),
      mediaHistoryApi.videos(projectId),
    ])
    const recovered = [
      ...images.items.flatMap((item) => historyTrack(item, 'image') ? [historyTrack(item, 'image')!] : []),
      ...videos.items.flatMap((item) => historyTrack(item, 'video') ? [historyTrack(item, 'video')!] : []),
    ]
    for (const track of recovered) {
      upsert(track)
      if (activeStatuses.has(track.status) && track.taskId) pollTask(track)
    }
  }, [pollTask, projectId, upsert])

  useEffect(() => {
    void resumeFromHistory().catch(() => undefined)
    const activePollers = pollers.current
    return () => {
      for (const controller of activePollers.values()) controller.abort()
      activePollers.clear()
    }
  }, [resumeFromHistory])

  return { tracks, watch, cancel, waitForTerminal, get: (key: GenerationTrackKey) => tracks[key] }
}

function historyTrack(item: MediaGenerationHistory, kind: 'image' | 'video'): TrackedGeneration | undefined {
  if (!item.task_id || !activeStatuses.has(item.status)) return undefined
  const key = kind === 'image'
    ? (item.project_asset_id ? assetImageKey(item.project_asset_id) : item.storyboard_id ? storyboardImageKey(item.storyboard_id) : undefined)
    : (item.storyboard_id ? storyboardVideoKey(item.storyboard_id) : undefined)
  if (!key) return undefined
  return {
    key,
    taskId: item.task_id,
    generationId: item.id,
    kind,
    startedAt: item.created_at,
    finishedAt: item.completed_at ?? undefined,
    status: item.status as GenerationTaskStatus,
    message: item.status === 'processing' ? '正在生成' : '排队中',
  }
}

function applyTask(track: TrackedGeneration, task: GenerationTask): TrackedGeneration {
  const terminal = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
  return {
    ...track,
    status: task.status,
    progress: typeof task.progress === 'number' && task.progress >= 0 ? task.progress : undefined,
    message: task.message || task.error || track.message,
    finishedAt: terminal ? (track.finishedAt ?? new Date().toISOString()) : undefined,
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}
