export interface AssetGenerationState {
  status: string
  message?: string
}

export function assetGenerationStatus(state?: AssetGenerationState, hasImage = false) {
  switch (state?.status) {
    case 'submitting': return { label: '正在提交', tone: 'pending' }
    case 'pending': return { label: '排队中', tone: 'pending' }
    case 'processing': return state.message === '归档中'
      ? { label: '归档中', tone: 'archiving' }
      : { label: '正在生成', tone: 'processing' }
    case 'completed': return { label: '已完成', tone: 'completed' }
    case 'failed': return { label: '失败', tone: 'failed' }
    case 'cancelled': return { label: '已停止', tone: 'cancelled' }
    default: return hasImage
      ? { label: '已完成', tone: 'completed' }
      : { label: '待生成', tone: 'idle' }
  }
}
