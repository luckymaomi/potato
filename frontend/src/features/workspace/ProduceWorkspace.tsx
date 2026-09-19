import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { App, Button, Image, Select, Space, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiConfigsApi } from '../../api/aiConfigs'
import { tasksApi } from '../../api/tasks'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { GenerationElapsedTime } from '../generation/GenerationElapsedTime'
import { useAnnounceGenerationOutcomes } from '../generation/useAnnounceGenerationOutcomes'
import { storyboardImageKey, storyboardVideoKey, useGenerationTracker } from '../generation/useGenerationTracker'
import {
  aspectRatioLabel,
  modelAspectRatioOptions,
  modelDurationOptions,
  preferredAspectRatio,
} from '../providers/catalog'
import type { ProviderModel, Storyboard } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

export function ProduceWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const [items, setItems] = useState<Storyboard[]>([])
  const [composeRunning, setComposeRunning] = useState(false)
  const [imageModelLabel, setImageModelLabel] = useState('读取中…')
  const [videoModelLabel, setVideoModelLabel] = useState('读取中…')
  const [imageAspectSummary, setImageAspectSummary] = useState('读取中…')
  const [videoAspectSummary, setVideoAspectSummary] = useState('读取中…')
  const [durationOptions, setDurationOptions] = useState<number[]>([])
  const [aspectOptions, setAspectOptions] = useState<string[]>([])
  const [shotDurations, setShotDurations] = useState<Record<number, number>>({})
  const [shotAspects, setShotAspects] = useState<Record<number, string>>({})
  const [videoQueue, setVideoQueue] = useState<{ total: number; completed: number; current?: string; stopping?: boolean }>()
  const stopVideoQueueRef = useRef(false)
  const currentVideoQueueKeyRef = useRef<string>()
  const tracker = useGenerationTracker(project.id)
  useAnnounceGenerationOutcomes(tracker.tracks)

  const load = useCallback(async () => {
    try { setItems((await workspaceApi.storyboards(project.id, episode.id)).items) }
    catch (reason) { notifyAppError({ message, modal }, reason) }
  }, [episode.id, message, modal, project.id])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let active = true
    void Promise.all([
      aiConfigsApi.modelPresets(),
      aiConfigsApi.models({ service_type: 'image' }),
      aiConfigsApi.models({ service_type: 'video' }),
    ]).then(([presets, imageModels, videoModels]) => {
      if (!active) return
      const image = presets.image
      const video = presets.video
      setImageModelLabel(image ? `${image.provider} / ${image.model}` : '自动选择（AI 配置）')
      setVideoModelLabel(video ? `${video.provider} / ${video.model}` : '自动选择（AI 配置）')

      const imageModel = pickPresetModel(imageModels, image)
      const videoModel = pickPresetModel(videoModels, video)
      const imageRatios = modelAspectRatioOptions(imageModel)
      const videoRatios = modelAspectRatioOptions(videoModel)
      const durations = modelDurationOptions(videoModel)

      setImageAspectSummary(imageRatios.length ? imageRatios.join('、') : '目录未声明图片画幅')
      setVideoAspectSummary(videoRatios.length ? videoRatios.join('、') : '目录未声明视频画幅')
      setAspectOptions(videoRatios)
      setDurationOptions(durations)
    }).catch(() => {
      if (!active) return
      setImageModelLabel('未读取到图片预设')
      setVideoModelLabel('未读取到视频预设')
      setImageAspectSummary('未读取到图片画幅')
      setVideoAspectSummary('未读取到视频画幅')
      setAspectOptions([])
      setDurationOptions([])
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setShotDurations((current) => {
      const next = { ...current }
      for (const shot of items) {
        if (durationOptions.length && (next[shot.id] === undefined || !durationOptions.includes(next[shot.id]))) {
          next[shot.id] = durationOptions[0]
        }
      }
      return next
    })
    setShotAspects((current) => {
      const next = { ...current }
      for (const shot of items) {
        if (aspectOptions.length && (next[shot.id] === undefined || !aspectOptions.includes(next[shot.id]))) {
          const preferred = preferredAspectRatio(aspectOptions, next[shot.id])
          if (preferred) next[shot.id] = preferred
        }
      }
      return next
    })
  }, [aspectOptions, durationOptions, items])

  useEffect(() => {
    const done = Object.values(tracker.tracks).some((item) => item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
    if (done) void load()
  }, [load, tracker.tracks])

  const compose = async () => {
    setComposeRunning(true)
    try {
      const result = await workspaceApi.compose(project.id, episode.id)
      if (result.task_id) {
        tracker.watch({ key: `compose:${episode.id}`, taskId: result.task_id, kind: 'video' })
        for (;;) {
          const task = await tasksApi.get(result.task_id)
          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') break
          await new Promise((wait) => window.setTimeout(wait, 1000))
        }
      }
      await load()
      notifyAppSuccess(message, '整集合成完成')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setComposeRunning(false)
    }
  }

  const generateVideo = async (shotId: number, announce = true): Promise<boolean> => {
    const duration = durationOptions.length ? shotDurations[shotId] : undefined
    const aspectRatio = aspectOptions.length ? shotAspects[shotId] : undefined
    try {
      const generation = await workspaceApi.generateStoryboardVideo(project.id, shotId, {
        duration,
        aspect_ratio: aspectRatio,
      })
      if (!generation.task_id) {
        if (announce) notifyAppError({ message, modal }, new Error('已提交但未返回任务号，请打开「AI 配置」确认密钥与视频模型后重试'))
        return false
      }
      tracker.watch({
        key: storyboardVideoKey(shotId),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: 'video',
        label: items.find((item) => item.id === shotId)?.title || `镜头 ${items.find((item) => item.id === shotId)?.storyboard_number ?? shotId}`,
        startedAt: generation.created_at,
      })
      const parts = [
        duration ? `${duration} 秒` : null,
        aspectRatio || null,
      ].filter(Boolean)
      if (announce) notifyAppSuccess(message, parts.length ? `已开始生成视频（${parts.join(' · ')}），可随时停止` : '已开始生成视频，可随时停止')
      return true
    } catch (reason) {
      if (announce) notifyAppError({ message, modal }, reason)
      return false
    }
  }

  const generatePendingVideos = async () => {
    if (videoQueue) return
    const pending = items.filter((item) => item.image_url && !item.video_url)
    if (!pending.length) {
      message.info('没有待生成的镜头视频')
      return
    }
    stopVideoQueueRef.current = false
    setVideoQueue({ total: pending.length, completed: 0 })
    try {
      for (const item of pending) {
        if (stopVideoQueueRef.current) break
        setVideoQueue((current) => current ? { ...current, current: item.title || `镜头 ${item.storyboard_number}` } : current)
        const key = storyboardVideoKey(item.id)
        currentVideoQueueKeyRef.current = key
        try {
          const started = await generateVideo(item.id, false)
          if (started) {
            if (stopVideoQueueRef.current) await tracker.cancel(key)
            await tracker.waitForTerminal(key)
          } else if (!stopVideoQueueRef.current) {
            notifyAppError({ message, modal }, new Error(`${item.title || `镜头 ${item.storyboard_number}`} 视频提交失败`))
          }
        } finally {
          currentVideoQueueKeyRef.current = undefined
          setVideoQueue((current) => current ? { ...current, completed: current.completed + 1 } : current)
        }
      }
    } finally {
      currentVideoQueueKeyRef.current = undefined
      setVideoQueue(undefined)
      await load()
    }
  }

  const stopPendingVideos = async () => {
    stopVideoQueueRef.current = true
    setVideoQueue((current) => current ? { ...current, stopping: true } : current)
    const key = currentVideoQueueKeyRef.current
    if (key) await tracker.cancel(key)
  }

  const imageCount = items.filter((item) => item.image_url).length
  const videoCount = items.filter((item) => item.video_url).length
  const missingImages = items.length - imageCount
  const missingVideos = items.length - videoCount
  const readyToCompose = items.length > 0 && videoCount === items.length
  const roomState = useMemo(() => {
    if (!items.length) return '暂无镜头'
    if (!missingImages && !missingVideos) return '可以合成'
    if (missingImages) return `${missingImages} 张分镜图待生成（请到分镜台出图）`
    return `${missingVideos} 个镜头视频待生成`
  }, [items.length, missingImages, missingVideos])

  return (
    <div className="workspace-column production-room">
      <div className="workspace-section-heading production-heading">
        <div><Typography.Title level={2}>生产</Typography.Title></div>
        <Space wrap className="production-heading-actions">
          {videoQueue
            ? <Button danger icon={<StopOutlined />} onClick={() => void stopPendingVideos()}>停止逐项生成视频</Button>
            : <Button icon={<PlayCircleOutlined />} onClick={() => void generatePendingVideos()}>生成未完成视频</Button>}
          <Button type="primary" disabled={!readyToCompose} loading={composeRunning} onClick={() => void compose()}>合成整集</Button>
        </Space>
      </div>

      {videoQueue ? <div className="generation-queue-status"><Tag color={videoQueue.stopping ? 'warning' : 'processing'}>{videoQueue.stopping ? '正在停止' : '视频逐项生成中'}</Tag><span>{videoQueue.current ?? '准备中'} · 已处理 {Math.min(videoQueue.completed, videoQueue.total)}/{videoQueue.total}</span></div> : null}

      <div className="production-status-strip">
        <div><span>{episode.episode_number}. {episode.title}</span><strong>{roomState}</strong></div>
        <div className="production-status-counts"><span><i className="status-dot is-image" />分镜图 {imageCount}/{items.length}</span><span><i className="status-dot is-video" />镜头视频 {videoCount}/{items.length}</span></div>
      </div>

      <div className="production-model-strip">
        <div><span>分镜图模型</span><strong>{imageModelLabel}</strong></div>
        <div><span>图片画幅能力</span><strong>{imageAspectSummary}</strong></div>
        <div><span>视频模型</span><strong>{videoModelLabel}</strong></div>
        <div><span>视频画幅能力</span><strong>{videoAspectSummary}</strong></div>
        <div><span>视频时长档位</span><strong>{durationOptions.length ? `${durationOptions.join('、')} 秒` : '目录未声明'}</strong></div>
      </div>

      {!items.length
        ? <div className="production-empty"><Typography.Title level={4}>先排好分镜</Typography.Title><Typography.Text type="secondary">生产会读取分镜台里的镜头。请先到左侧「分镜台」排镜出图。</Typography.Text></div>
        : <div className="production-shot-grid">{items.map((shot) => (
          <ProductionShotCard
            key={shot.id}
            shot={shot}
            durationOptions={durationOptions}
            aspectOptions={aspectOptions}
            duration={shotDurations[shot.id]}
            aspectRatio={shotAspects[shot.id]}
            onDurationChange={(value) => setShotDurations((current) => ({ ...current, [shot.id]: value }))}
            onAspectChange={(value) => setShotAspects((current) => ({ ...current, [shot.id]: value }))}
            imageTrack={tracker.get(storyboardImageKey(shot.id))}
            videoTrack={tracker.get(storyboardVideoKey(shot.id))}
            onGenerateVideo={() => void generateVideo(shot.id)}
            onStopVideo={() => void tracker.cancel(storyboardVideoKey(shot.id))}
          />
        ))}</div>}

      <div className="production-footer-note"><span>每个镜头可单独选视频时长与视频画幅，选项只来自当前视频模型目录能力。图片画幅在分镜台选择。</span><span>整集会按镜头顺序合成，缺视频时不会生成成片。</span></div>
    </div>
  )
}

function pickPresetModel(
  models: ProviderModel[],
  preset: { provider: string; model: string } | null | undefined,
): ProviderModel | undefined {
  if (preset) {
    const matched = models.find((model) => model.provider === preset.provider && model.id === preset.model)
    if (matched) return matched
  }
  return models[0]
}

function ProductionShotCard({
  shot,
  durationOptions,
  aspectOptions,
  duration,
  aspectRatio,
  onDurationChange,
  onAspectChange,
  imageTrack,
  videoTrack,
  onGenerateVideo,
  onStopVideo,
}: {
  shot: Storyboard
  durationOptions: number[]
  aspectOptions: string[]
  duration?: number
  aspectRatio?: string
  onDurationChange: (value: number) => void
  onAspectChange: (value: string) => void
  imageTrack?: { startedAt: string; finishedAt?: string; status: string; progress?: number; message?: string }
  videoTrack?: { startedAt: string; finishedAt?: string; status: string; progress?: number; message?: string }
  onGenerateVideo: () => void
  onStopVideo: () => void
}) {
  const imageReady = Boolean(shot.image_url)
  const videoReady = Boolean(shot.video_url)
  const videoBusy = videoTrack?.status === 'pending' || videoTrack?.status === 'processing'
  const imageBusy = imageTrack?.status === 'pending' || imageTrack?.status === 'processing'
  return <article className="production-shot-card">
    <div className="production-shot-card-head"><div><strong>{shot.title || '未命名镜头'}</strong></div><Tag>{shot.shot_size || '景别待定'}</Tag></div>
    <div className="production-shot-media">
      {shot.image_url ? <Image preview src={mediaUrl(shot.image_url)} alt={shot.title || '分镜图'} /> : <div className="production-media-empty"><span>分镜图</span><small>请到分镜台生成</small></div>}
      {shot.video_url ? <video controls src={mediaUrl(shot.video_url)} /> : <div className="production-video-empty"><span>镜头视频</span><small>待生成</small></div>}
    </div>
    <div className="production-shot-status">
      <span className={imageReady ? 'is-ready' : ''}>图片 {imageReady ? '完成' : '待生成'}</span>
      <span className={videoReady ? 'is-ready is-video' : ''}>视频 {videoReady ? '完成' : '待生成'}</span>
    </div>
    {(durationOptions.length || aspectOptions.length) ? (
      <div className="production-shot-params">
        {durationOptions.length ? (
          <label>
            <span>本镜时长</span>
            <Select
              size="small"
              value={duration}
              style={{ width: '100%' }}
              options={durationOptions.map((value) => ({ value, label: `${value} 秒` }))}
              onChange={onDurationChange}
              disabled={videoBusy}
            />
          </label>
        ) : null}
        {aspectOptions.length ? (
          <label>
            <span>本镜视频画幅</span>
            <Select
              size="small"
              value={aspectRatio}
              style={{ width: '100%' }}
              options={aspectOptions.map((value) => ({ value, label: aspectRatioLabel(value) }))}
              onChange={onAspectChange}
              disabled={videoBusy}
            />
          </label>
        ) : null}
      </div>
    ) : null}
    {imageTrack ? <GenerationElapsedTime startedAt={imageTrack.startedAt} finishedAt={imageTrack.finishedAt} active={imageBusy} progress={imageTrack.progress} message={imageTrack.message} /> : null}
    {videoTrack ? <GenerationElapsedTime startedAt={videoTrack.startedAt} finishedAt={videoTrack.finishedAt} active={videoBusy} progress={videoTrack.progress} message={videoTrack.message} /> : null}
    <div className="production-shot-actions">
      {videoBusy
        ? <Button type="primary" danger icon={<StopOutlined />} onClick={onStopVideo}>停止生成</Button>
        : <Button type="primary" size="large" disabled={!imageReady} onClick={onGenerateVideo}>
          {videoReady ? '重新生成' : '生成视频'}
        </Button>}
    </div>
    <div className="production-shot-caption">{shot.description || shot.action || '未填写剧情说明'}</div>
  </article>
}
