export interface AssetGenerationState {
  status: string
  message?: string
  failure_stage?: string | null
  archive_attempts?: number
}

export function assetGenerationStatus(state?: AssetGenerationState, hasImage = false) {
  switch (state?.status) {
    case 'submitting': return { label: '正在提交', tone: 'pending' }
    case 'pending': return { label: '排队中', tone: 'pending' }
    case 'processing': return state.message === '正在保存到本地' || state.message === '归档中'
      ? { label: '正在保存到本地', tone: 'archiving' }
      : { label: '正在生成', tone: 'processing' }
    case 'remote': {
      const exhausted = (state.archive_attempts ?? 0) >= 5
      return exhausted
        ? { label: '远程预览·本地保存失败', tone: 'archiving' }
        : { label: '远程预览·待归档', tone: 'archiving' }
    }
    case 'completed': return { label: '已完成', tone: 'completed' }
    case 'failed': return { label: '失败', tone: 'failed' }
    case 'cancelled': return { label: '已停止', tone: 'cancelled' }
    default: return hasImage
      ? { label: '已完成', tone: 'completed' }
      : { label: '待生成', tone: 'idle' }
  }
}
