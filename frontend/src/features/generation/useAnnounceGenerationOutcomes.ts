import { App } from 'antd'
import { useEffect, useRef } from 'react'
import { notifyAppError } from '../../errors/appError'
import type { TrackedGeneration } from '../generation/useGenerationTracker'

/** 任务终态只提示一次：失败弹友好原因，停止给轻提示，成功确认结果。 */
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
      if (track.status === 'failed') {
        notifyAppError({ message, modal }, new Error(track.message || '生成失败'))
      } else if (track.status === 'cancelled') {
        message.info(track.kind === 'video' ? '已停止视频生成' : '已停止图片生成')
      } else {
        message.success(track.kind === 'video' ? '视频生成完成' : '图片生成完成')
      }
    }
  }, [message, modal, tracks])
}
