import { App, Button, Image, Modal, Space, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waitForTask } from '../../api/tasks'
import { workspaceApi } from '../../api/workspace'
import type { Storyboard } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

export function ProduceWorkspace() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { project, episode } = useProjectWorkspace()
  const [items, setItems] = useState<Storyboard[]>([])
  const [running, setRunning] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try { setItems((await workspaceApi.storyboards(project.id, episode.id)).items) }
    catch (reason) { message.error(reason instanceof Error ? reason.message : '生产列表加载失败') }
  }, [episode.id, message, project.id])
  useEffect(() => { void load() }, [load])

  const run = async (key: string, action: () => Promise<{ task_id?: string | null }>) => {
    setRunning((current) => ({ ...current, [key]: true }))
    try {
      const result = await action()
      if (result.task_id) await waitForTask(result.task_id)
      await load()
      message.success('任务完成')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '任务失败')
    } finally {
      setRunning((current) => ({ ...current, [key]: false }))
    }
  }

  const batchImages = async () => {
    const result = await workspaceApi.batchProduce(project.id, { episode_id: episode.id, target: 'images' })
    if (result.task_id) await waitForTask(result.task_id)
    await Promise.all((result.items ?? []).flatMap((item) => taskId(item)).map((id) => waitForTask(id)))
    return { task_id: null }
  }

  const batchVideos = () => new Promise<void>((resolve) => {
    Modal.confirm({
      title: '批量生成镜头视频？',
      content: '视频会逐个提交并产生费用。分镜图不会自动生成视频。',
      okText: '确认提交',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onCancel: () => resolve(),
      onOk: async () => {
        await run('batch-videos', async () => {
          const result = await workspaceApi.batchProduce(project.id, { episode_id: episode.id, target: 'videos', confirm_cost: true })
          await Promise.all((result.items ?? []).flatMap((item) => taskId(item)).map((id) => waitForTask(id)))
          return { task_id: null }
        })
        resolve()
      },
    })
  })

  const imageCount = items.filter((item) => item.image_url).length
  const videoCount = items.filter((item) => item.video_url).length
  const missingImages = items.length - imageCount
  const missingVideos = items.length - videoCount
  const readyToCompose = items.length > 0 && videoCount === items.length
  const roomState = useMemo(() => {
    if (!items.length) return '暂无镜头'
    if (!missingImages && !missingVideos) return '可以合成'
    if (missingImages) return `${missingImages} 张分镜图待生成`
    return `${missingVideos} 个镜头视频待生成`
  }, [items.length, missingImages, missingVideos])

  return (
    <div className="workspace-column production-room">
      <div className="workspace-section-heading production-heading">
        <div><Typography.Title level={2}>生产</Typography.Title></div>
        <Space wrap className="production-heading-actions">
          <Button loading={running['batch-images']} onClick={() => void run('batch-images', batchImages)}>批量出图</Button>
          <Button danger loading={running['batch-videos']} onClick={() => void batchVideos()}>批量出视频</Button>
          <Button type="primary" disabled={!readyToCompose} loading={running.compose} onClick={() => void run('compose', () => workspaceApi.compose(project.id, episode.id))}>合成整集</Button>
        </Space>
      </div>

      <div className="production-status-strip">
        <div><span>{episode.episode_number}. {episode.title}</span><strong>{roomState}</strong></div>
        <div className="production-status-counts"><span><i className="status-dot is-image" />分镜图 {imageCount}/{items.length}</span><span><i className="status-dot is-video" />镜头视频 {videoCount}/{items.length}</span></div>
      </div>

      {!items.length ? <div className="production-empty"><Typography.Title level={4}>先排好分镜</Typography.Title><Typography.Text type="secondary">生产会读取分镜台里的镜头。</Typography.Text><Button type="primary" onClick={() => navigate(`/film/${project.id}/storyboard?episode_id=${episode.id}`)}>去分镜台</Button></div> : <div className="production-shot-grid">{items.map((shot) => <ProductionShotCard key={shot.id} shot={shot} projectId={project.id} running={running} run={run} onOpenStoryboard={() => navigate(`/film/${project.id}/storyboard?episode_id=${episode.id}`)} />)}</div>}

      <div className="production-footer-note"><span>视频仅在单镜按钮或批量确认后提交。</span><span>整集会按镜头顺序合成，缺视频时不会生成成片。</span></div>
    </div>
  )
}

function ProductionShotCard({ shot, projectId, running, run, onOpenStoryboard }: { shot: Storyboard; projectId: number; running: Record<string, boolean>; run: (key: string, action: () => Promise<{ task_id?: string | null }>) => Promise<void>; onOpenStoryboard: () => void }) {
  const imageReady = Boolean(shot.image_url)
  const videoReady = Boolean(shot.video_url)
  return <article className="production-shot-card">
    <div className="production-shot-card-head"><div><span className="production-shot-number">{String(shot.storyboard_number).padStart(2, '0')}</span><strong>{shot.title || '未命名镜头'}</strong></div><Tag>{shot.shot_size || '景别待定'}</Tag></div>
    <div className="production-shot-media">
      {shot.image_url ? <Image preview src={mediaUrl(shot.image_url)} alt={shot.title || '分镜图'} /> : <div className="production-media-empty"><span>分镜图</span><small>待生成</small></div>}
      {shot.video_url ? <video controls src={mediaUrl(shot.video_url)} /> : <div className="production-video-empty"><span>镜头视频</span><small>待生成</small></div>}
    </div>
    <div className="production-shot-status"><span className={imageReady ? 'is-ready' : ''}>图片 {imageReady ? '完成' : '待生成'}</span><span className={videoReady ? 'is-ready is-video' : ''}>视频 {videoReady ? '完成' : '待生成'}</span></div>
    <div className="production-shot-actions"><Button size="small" loading={running[`image-${shot.id}`]} onClick={() => void run(`image-${shot.id}`, () => workspaceApi.generateStoryboardImage(projectId, shot.id))}>{imageReady ? '重做分镜图' : '生成分镜图'}</Button><Button size="small" danger disabled={!imageReady} loading={running[`video-${shot.id}`]} onClick={() => void run(`video-${shot.id}`, () => workspaceApi.generateStoryboardVideo(projectId, shot.id))}>{videoReady ? '重做视频' : '生成镜头视频'}</Button><Button type="text" size="small" onClick={onOpenStoryboard}>编辑镜头</Button></div>
    <div className="production-shot-caption">{shot.description || shot.action || '未填写剧情说明'}</div>
  </article>
}

function taskId(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const id = (value as { task_id?: unknown }).task_id
  return typeof id === 'string' && id ? [id] : []
}
