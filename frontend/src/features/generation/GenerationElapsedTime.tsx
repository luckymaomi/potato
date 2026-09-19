import { useEffect, useState } from 'react'
import { generationElapsedLabel } from './elapsedTime'

export function GenerationElapsedTime({
  startedAt,
  finishedAt,
  active = false,
  progress,
  message,
}: {
  startedAt?: string
  finishedAt?: string
  active?: boolean
  progress?: number
  message?: string
}) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active || !startedAt) return undefined
    const timer = window.setInterval(() => setTick((value) => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [active, startedAt])

  const stage = message?.trim()
  const percent = typeof progress === 'number' && progress >= 0 ? `${Math.round(progress)}%` : undefined

  return (
    <span className="generation-elapsed-time">
      {generationElapsedLabel({ startedAt, finishedAt, active })}
      {active && stage ? <em>{stage}</em> : null}
      {active && percent ? <em>{percent}</em> : null}
    </span>
  )
}
