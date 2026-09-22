import { App } from 'antd'
import { useEffect, useRef } from 'react'
import { notifyAppError } from '../../errors/appError'
import type { TrackedGeneration } from '../generation/useGenerationTracker'

/** 所有媒体任务的终态都从这里投影，页面只负责提交任务和展示进行中状态。 */
export function useAnnounceGenerationOutcomes(tracks: Record<string, TrackedGeneration>) {
  const { message, modal } = App.useApp()
  const announced = useRef(new Set<string>())

  useEffect(() => {
    for (const track of Object.values(tracks)) {
      if (track.status !== 'failed' && track.status !== 'cancelled' && track.status !== 'completed') continue
      if (!track.finishedAt) continue
      const stamp = `${track.key}:${track.status}:${track.finishedAt}`
      if (announced.current.has(stamp)) continue
      announced.current.add(stamp)
      const subject = track.label || '图片'
      if (track.status === 'failed') {
        notifyAppError({ message, modal }, new Error(`${subject}生成失败：${track.message || '供应商未返回具体原因'}`))
      } else if (track.status === 'cancelled') {
        message.info(`已停止${subject}生成`)
      } else {
        message.success(`${subject}生成完成`)
      }
    }
  }, [message, modal, tracks])
}
