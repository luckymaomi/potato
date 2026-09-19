export function elapsedSeconds(startedAt: string | undefined, now = Date.now()): number {
  if (!startedAt) return 0
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((now - started) / 1_000))
}

export function formatElapsedSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = String(seconds % 60).padStart(2, '0')
  if (minutes < 60) return `${minutes} 分 ${remainingSeconds} 秒`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${String(minutes % 60).padStart(2, '0')} 分 ${remainingSeconds} 秒`
}

export interface GenerationTiming {
  startedAt?: string
  finishedAt?: string
  active?: boolean
}

export function generationElapsedLabel(timing: GenerationTiming, now = Date.now()): string {
  if (timing.active) {
    if (!validTimestamp(timing.startedAt)) return '耗时未知'
    return `已生成 ${formatElapsedSeconds(elapsedSeconds(timing.startedAt, now))}`
  }
  if (!validTimestamp(timing.startedAt) || !validTimestamp(timing.finishedAt)) return '耗时未知'
  const started = Date.parse(timing.startedAt as string)
  const finished = Date.parse(timing.finishedAt as string)
  if (finished < started) return '耗时未知'
  return `耗时 ${formatElapsedSeconds(elapsedSeconds(timing.startedAt, finished))}`
}

function validTimestamp(value: string | undefined): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}
