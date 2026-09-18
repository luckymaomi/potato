import { useEffect, useState } from 'react'
import { generationElapsedLabel } from './elapsedTime'

export function GenerationElapsedTime({ startedAt, finishedAt, active = false }: {
  startedAt?: string
  finishedAt?: string
  active?: boolean
}) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active || !startedAt) return undefined
    const timer = window.setInterval(() => setTick((value) => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [active, startedAt])

  return (
    <span className="generation-elapsed-time">
      {generationElapsedLabel({ startedAt, finishedAt, active })}
    </span>
  )
}
