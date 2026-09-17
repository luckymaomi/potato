import type { MediaLifecycleState, Project } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { productionPlugin, type ProductionNodeData } from './catalog'

export function restoreProductionNodeLifecycle(data: ProductionNodeData, project: Project): ProductionNodeData {
  const plugin = productionPlugin(data.role)
  if (plugin.material === 'text') {
    if (data.status === 'pending' || data.status === 'running') {
      return { ...data, status: 'idle', error: '上次运行未完成，请重新运行此节点。' }
    }
    if (data.status === 'completed' && !isReusableProductionNode(data)) return { ...data, status: 'idle' }
    return data
  }

  const generationId = data.result.generationId
  const state = generationId ? mediaLifecycleState(project, plugin.material, generationId) : undefined
  if (generationId && state?.status === 'completed' && state.available && state.url && state.local_path) {
    return {
      ...data,
      status: 'completed',
      error: '',
      result: {
        ...data.result,
        generationId,
        outputUrl: mediaUrl(state.url),
        localPath: state.local_path,
        mediaAvailable: true,
      },
    }
  }

  const hadMedia = Boolean(generationId || data.result.generationId || data.result.outputUrl)
  const preservedFailure = !hadMedia && (data.status === 'failed' || data.status === 'cancelled')
  return {
    ...data,
    status: preservedFailure ? data.status : hadMedia ? 'failed' : 'idle',
    error: preservedFailure
      ? data.error
      : hadMedia ? lifecycleFailureMessage(state) : data.status === 'pending' || data.status === 'running' ? '上次运行未完成，请重新运行此节点。' : '',
    result: {
      ...data.result,
      outputUrl: undefined,
      generationId,
      localPath: state?.local_path || undefined,
      mediaAvailable: false,
    },
  }
}

export function isReusableProductionNode(data: ProductionNodeData): boolean {
  if (data.status !== 'completed') return false
  const plugin = productionPlugin(data.role)
  if (plugin.material !== 'text') {
    return Boolean(
      data.result.generationId
      && data.result.localPath
      && data.result.mediaAvailable === true
      && data.result.outputUrl?.startsWith('/static/'),
    )
  }
  if (data.result.text?.trim() || data.parameters.text?.trim()) return true
  return Object.values(data.result.assetRefs || {}).some((values) => Boolean(values?.length))
}

export function mediaLifecycleState(
  project: Project,
  kind: 'image' | 'video',
  generationId: number | null | undefined,
): MediaLifecycleState | undefined {
  if (!generationId) return undefined
  return project.media_lifecycle?.[kind === 'image' ? 'images' : 'videos'][String(generationId)]
}

function lifecycleFailureMessage(state: MediaLifecycleState | undefined): string {
  if (!state) return '当前版本指针无效，请选择可用历史版本或重新生成。'
  if (state.failure_stage === 'provider') return '供应商生成失败，当前节点没有可用本地媒体。'
  if (state.failure_stage === 'archive') return '供应商已返回结果，但本地归档失败。'
  if (state.failure_stage === 'composition') return '本地合成失败，当前节点没有可用成片。'
  return '当前版本的本地媒体文件缺失，请选择可用历史版本或重新生成。'
}
