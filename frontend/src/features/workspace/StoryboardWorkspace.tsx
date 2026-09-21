import {
  BuildOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  App,
  Button,
  Collapse,
  Empty,
  Form,
  Image,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiConfigsApi } from '../../api/aiConfigs'
import { tasksApi } from '../../api/tasks'
import { uploadsApi } from '../../api/media'
import { workspaceApi, type StoryboardReadiness } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { GenerationElapsedTime } from '../generation/GenerationElapsedTime'
import { useAnnounceGenerationOutcomes } from '../generation/useAnnounceGenerationOutcomes'
import { storyboardImageKey, storyboardVideoKey, useGenerationTracker } from '../generation/useGenerationTracker'
import {
  aspectRatioLabel,
  aspectRatiosFor,
  modelAspectRatioOptions,
  modelDurationOptions,
  preferredAspectRatio,
} from '../providers/catalog'
import type { AssetKind, ProjectAsset, ProviderModel, Storyboard } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

interface StoryboardFormValues extends Partial<Storyboard> {
  character_asset_ids?: number[]
  scene_asset_ids?: number[]
  prop_asset_ids?: number[]
  aspect_ratio?: string
}

const assetLabels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }

export function StoryboardWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const [items, setItems] = useState<Storyboard[]>([])
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [readiness, setReadiness] = useState<Record<number, StoryboardReadiness>>({})
  const [selectedId, setSelectedId] = useState<number>()
  const [saving, setSaving] = useState(false)
  const [assemblingId, setAssemblingId] = useState<number>()
  const [recipeReassembledId, setRecipeReassembledId] = useState<number>()
  const [imageModels, setImageModels] = useState<ProviderModel[]>([])
  const [imageModelLabel, setImageModelLabel] = useState('读取中…')
  const [videoModelLabel, setVideoModelLabel] = useState('读取中…')
  const [durationOptions, setDurationOptions] = useState<number[]>([])
  const [videoAspectOptions, setVideoAspectOptions] = useState<string[]>([])
  const [shotDurations, setShotDurations] = useState<Record<number, number>>({})
  const [shotAspects, setShotAspects] = useState<Record<number, string>>({})
  const [composeRunning, setComposeRunning] = useState(false)
  const [videoQueue, setVideoQueue] = useState<{ total: number; completed: number; current?: string; stopping?: boolean }>()
  const stopVideoQueueRef = useRef(false)
  const currentVideoQueueKeyRef = useRef<string>()
  const [form] = Form.useForm<StoryboardFormValues>()
  const tracker = useGenerationTracker(project.id)
  useAnnounceGenerationOutcomes(tracker.tracks)
  const aspectRatio = Form.useWatch('aspect_ratio', form)
  const characterAssetIds = Form.useWatch('character_asset_ids', { form, preserve: true }) ?? []
  const sceneAssetIds = Form.useWatch('scene_asset_ids', { form, preserve: true }) ?? []
  const propAssetIds = Form.useWatch('prop_asset_ids', { form, preserve: true }) ?? []
  const extraReferences = Form.useWatch('extra_reference_images', { form, preserve: true }) ?? []
  const imageRecipeReferences = Form.useWatch('image_recipe_references', { form, preserve: true }) ?? []
  const videoRecipeReferences = Form.useWatch('video_recipe_references', { form, preserve: true }) ?? []
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId])
  const selectedReadiness = selected ? readiness[selected.id] : undefined
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const selectedIndex = selected ? items.findIndex((item) => item.id === selected.id) : -1
  const imageTrack = selected ? tracker.get(storyboardImageKey(selected.id)) : undefined
  const imageBusy = imageTrack?.status === 'pending' || imageTrack?.status === 'processing'
  const aspectOptions = useMemo(() => aspectRatiosFor(imageModels, aspectRatio), [aspectRatio, imageModels])

  const load = useCallback(async () => {
    try {
      const [storyboards, projectAssets] = await Promise.all([
        workspaceApi.storyboards(project.id, episode.id),
        workspaceApi.assets(project.id),
      ])
      const readinessEntries = await Promise.all(storyboards.items.map(async (item) => [item.id, await workspaceApi.storyboardReadiness(project.id, item.id)] as const))
      setItems(storyboards.items)
      setAssets(projectAssets.items)
      setReadiness(Object.fromEntries(readinessEntries))
      setSelectedId((current) => storyboards.items.some((item) => item.id === current) ? current : storyboards.items[0]?.id)
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }, [episode.id, message, modal, project.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let active = true
    void Promise.all([aiConfigsApi.models({ service_type: 'image' }), aiConfigsApi.models({ service_type: 'video' }), aiConfigsApi.modelPresets()])
      .then(([models, videoModels, presets]) => {
        if (!active) return
        const preferred = presets.image
        setImageModelLabel(preferred ? `${preferred.provider} / ${preferred.model}` : '自动选择（AI 配置）')
        const filtered = preferred
          ? models.filter((model) => model.provider === preferred.provider && model.id === preferred.model)
          : models
        setImageModels(filtered.length ? filtered : models)
        const video = presets.video
        setVideoModelLabel(video ? `${video.provider} / ${video.model}` : '自动选择（AI 配置）')
        const selectedVideo = video
          ? videoModels.find((model) => model.provider === video.provider && model.id === video.model) ?? videoModels[0]
          : videoModels[0]
        setDurationOptions(modelDurationOptions(selectedVideo))
        setVideoAspectOptions(modelAspectRatioOptions(selectedVideo))
      })
      .catch((reason) => {
        if (!active) return
        setImageModels([])
        setImageModelLabel('未读取到图片预设')
        setVideoModelLabel('未读取到视频预设')
        setDurationOptions([])
        setVideoAspectOptions([])
        notifyAppError({ message, modal }, reason instanceof Error ? reason : new Error('图片模型目录加载失败，请打开「AI 配置」刷新模型列表'))
      })
    return () => { active = false }
  }, [message, modal])

  useEffect(() => {
    if (!selected) {
      form.resetFields()
      return
    }
    form.setFieldsValue({
      ...selected,
      character_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'character'),
      scene_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'scene'),
      prop_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'prop'),
      aspect_ratio: preferredAspectRatio(aspectOptions, form.getFieldValue('aspect_ratio')),
    })
    // 只在切换镜头时灌表，避免异步状态回灌冲掉未保存编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: selected.id only
  }, [selected?.id, form])

  useEffect(() => {
    if (!selected) return
    form.setFieldsValue({
      character_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'character'),
      scene_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'scene'),
      prop_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'prop'),
    })
  }, [assets, form, selected])

  useEffect(() => {
    if (!selected || !aspectOptions.length) return
    const current = form.getFieldValue('aspect_ratio') as string | undefined
    const next = preferredAspectRatio(aspectOptions, current)
    if (next !== current) form.setFieldValue('aspect_ratio', next)
  }, [aspectOptions, form, selected])

  useEffect(() => {
    const done = Object.values(tracker.tracks).some((item) => item.key.startsWith('storyboard:') && (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled'))
    if (done) void load()
  }, [load, tracker.tracks])

  const create = async () => {
    try {
      const created = await workspaceApi.createStoryboard(project.id, { episode_id: episode.id })
      await load()
      setSelectedId(created.id)
      notifyAppSuccess(message, '已加入镜头')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await workspaceApi.updateStoryboard(project.id, selected.id, {
        ...storyboardPayload(form.getFieldsValue(true)),
        ...(recipeReassembledId === selected.id ? { recipe_reassembled: true } : {}),
      })
      await load()
      setRecipeReassembledId((current) => current === selected.id ? undefined : current)
      notifyAppSuccess(message, '镜头已保存')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setSaving(false)
    }
  }

  const assembleRecipes = async () => {
    if (!selected || assemblingId === selected.id) return
    const storyboardId = selected.id
    try {
      setAssemblingId(storyboardId)
      const recipes = await workspaceApi.assembleStoryboardRecipes(project.id, storyboardId, storyboardPayload(form.getFieldsValue(true)))
      if (selectedIdRef.current !== storyboardId) return
      form.setFieldsValue({
        image_recipe_prompt: recipes.imageRecipe.imagePrompt,
        video_recipe_prompt: recipes.videoRecipe.videoPrompt,
        image_recipe_references: recipes.imageRecipe.imageReferences,
        video_recipe_references: recipes.videoRecipe.videoReferences,
      })
      setRecipeReassembledId(storyboardId)
      notifyAppSuccess(message, '图片与视频提示词已组装')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setAssemblingId((current) => current === storyboardId ? undefined : current)
    }
  }

  const remove = async (id?: number) => {
    const targetId = id ?? selected?.id
    if (!targetId) return
    try {
      await workspaceApi.removeStoryboard(project.id, targetId)
      await load()
      notifyAppSuccess(message, '镜头已删除')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const generateImage = async () => {
    if (!selected) return
    try {
      const values = form.getFieldsValue(true)
      const { aspect_ratio, ...fields } = values
      await workspaceApi.updateStoryboard(project.id, selected.id, {
        ...storyboardPayload(fields),
        ...(recipeReassembledId === selected.id ? { recipe_reassembled: true } : {}),
      })
      const generation = await workspaceApi.generateStoryboardImage(project.id, selected.id, {
        aspect_ratio,
      })
      if (!generation.task_id) {
        notifyAppError({ message, modal }, new Error('已提交但未返回任务号，请打开「AI 配置」确认密钥与模型目录后重试'))
        return
      }
      tracker.watch({
        key: storyboardImageKey(selected.id),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: 'image',
        label: selected.title || `镜头 ${selected.storyboard_number}`,
        startedAt: generation.created_at,
      })
      notifyAppSuccess(message, '已开始生成分镜图，可随时停止')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const uploadImage = async (file: File) => {
    if (!selected) return
    try {
      await workspaceApi.uploadStoryboardImage(project.id, selected.id, file)
      await load()
      notifyAppSuccess(message, '已上传分镜图')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  const uploadExtraReference = async (file: File) => {
    try {
      const uploaded = await uploadsApi.image(file, project.id)
      form.setFieldValue('extra_reference_images', [...new Set([...extraReferences, uploaded.url])])
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  const clearImage = async () => {
    if (!selected) return
    try {
      await workspaceApi.clearStoryboardImage(project.id, selected.id)
      await load()
      notifyAppSuccess(message, '已清除分镜图')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const confirmReview = async (media: 'image' | 'video') => {
    if (!selected) return
    try {
      await workspaceApi.confirmStoryboardReview(project.id, selected.id, media)
      await load()
      notifyAppSuccess(message, media === 'image' ? '已确认图片通过' : '已确认视频通过')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const selectRelative = (offset: number) => {
    const next = items[selectedIndex + offset]
    if (next) setSelectedId(next.id)
  }

  const selectedAssetIds = [...characterAssetIds, ...sceneAssetIds, ...propAssetIds]
  const imageReady = Boolean(selected?.image_url)
  const videoReady = Boolean(selected?.video_url)
  const videoTrack = selected ? tracker.get(storyboardVideoKey(selected.id)) : undefined
  const videoBusy = videoTrack?.status === 'pending' || videoTrack?.status === 'processing'
  const composeBlocked = !items.length || items.some((item) => !item.video_url || item.video_needs_review)
  const composeReason = items.some((item) => item.video_needs_review)
    ? `待复核视频：${items.filter((item) => item.video_needs_review).map((item) => item.storyboard_number).join('、')}`
    : items.some((item) => !item.video_url) ? '仍有镜头缺少视频' : undefined

  useEffect(() => {
    setShotDurations((current) => {
      const next = { ...current }
      for (const shot of items) if (durationOptions.length && (next[shot.id] === undefined || !durationOptions.includes(next[shot.id]))) next[shot.id] = durationOptions[0]
      return next
    })
    setShotAspects((current) => {
      const next = { ...current }
      for (const shot of items) {
        if (videoAspectOptions.length && (next[shot.id] === undefined || !videoAspectOptions.includes(next[shot.id]))) {
          const preferred = preferredAspectRatio(videoAspectOptions, next[shot.id])
          if (preferred) next[shot.id] = preferred
        }
      }
      return next
    })
  }, [durationOptions, items, videoAspectOptions])

  const generateVideo = async (shotId: number, announce = true): Promise<boolean> => {
    try {
      const generation = await workspaceApi.generateStoryboardVideo(project.id, shotId, {
        duration: durationOptions.length ? shotDurations[shotId] : undefined,
        aspect_ratio: videoAspectOptions.length ? shotAspects[shotId] : undefined,
      })
      if (!generation.task_id) {
        if (announce) notifyAppError({ message, modal }, new Error('已提交但未返回任务号，请打开 AI 配置确认视频模型后重试'))
        return false
      }
      tracker.watch({ key: storyboardVideoKey(shotId), taskId: generation.task_id, generationId: generation.id, kind: 'video', label: items.find((item) => item.id === shotId)?.title || `镜头 ${shotId}`, startedAt: generation.created_at })
      if (announce) notifyAppSuccess(message, '已开始生成视频，可随时停止')
      return true
    } catch (reason) {
      if (announce) notifyAppError({ message, modal }, reason)
      return false
    }
  }

  const generatePendingVideos = async () => {
    if (videoQueue) return
    const pending = items.filter((item) => item.image_url && !item.video_url)
    if (!pending.length) { message.info('没有待生成的镜头视频'); return }
    stopVideoQueueRef.current = false
    setVideoQueue({ total: pending.length, completed: 0 })
    try {
      for (const item of pending) {
        if (stopVideoQueueRef.current) break
        setVideoQueue((current) => current ? { ...current, current: item.title || `镜头 ${item.storyboard_number}` } : current)
        const key = storyboardVideoKey(item.id)
        currentVideoQueueKeyRef.current = key
        const started = await generateVideo(item.id, false)
        if (started) {
          if (stopVideoQueueRef.current) await tracker.cancel(key)
          await tracker.waitForTerminal(key)
        }
        setVideoQueue((current) => current ? { ...current, completed: current.completed + 1 } : current)
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

  const composeEpisode = async () => {
    setComposeRunning(true)
    try {
      const result = await workspaceApi.compose(project.id, episode.id)
      if (result.task_id) {
        tracker.watch({ key: `compose:${episode.id}`, taskId: result.task_id, kind: 'video' })
        for (;;) {
          const task = await tasksApi.get(result.task_id)
          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') break
          await new Promise((resolve) => window.setTimeout(resolve, 1000))
        }
      }
      await load()
      notifyAppSuccess(message, '整集合成完成')
    } catch (reason) { notifyAppError({ message, modal }, reason) }
    finally { setComposeRunning(false) }
  }

  const toggleAsset = (kind: AssetKind, id: number) => {
    const field = kind === 'character' ? 'character_asset_ids' : kind === 'scene' ? 'scene_asset_ids' : 'prop_asset_ids'
    const current = form.getFieldValue(field) ?? []
    form.setFieldValue(field, current.includes(id) ? current.filter((item: number) => item !== id) : [...current, id])
  }

  return (
    <div className="workspace-column director-room">
      <div className="workspace-section-heading director-heading">
        <div><Typography.Title level={2}>分镜台</Typography.Title></div>
        <Space wrap className="director-heading-actions">
          <div className="director-model-label"><span>分镜图模型</span><strong>{imageModelLabel}</strong></div>
          <div className="director-model-label"><span>视频模型</span><strong>{videoModelLabel}</strong></div>
          <div className="director-progress-summary"><strong>{items.length}</strong><span>镜头</span><i /><strong>{items.filter((item) => item.image_url).length}</strong><span>已出图</span></div>
          {videoQueue ? <Button danger icon={<StopOutlined />} onClick={() => void stopPendingVideos()}>停止逐项生成</Button> : <Button onClick={() => void generatePendingVideos()}>生成未完成视频</Button>}
          <Button type="primary" disabled={composeBlocked} loading={composeRunning} onClick={() => void composeEpisode()}>合成整集</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>加入镜头</Button>
        </Space>
      </div>
      {composeReason ? <Typography.Text type="secondary">{composeReason}</Typography.Text> : null}
      {videoQueue ? <div className="generation-queue-status"><Tag color={videoQueue.stopping ? 'warning' : 'processing'}>{videoQueue.stopping ? '正在停止' : '视频逐项生成中'}</Tag><span>{videoQueue.current ?? '准备中'} · 已处理 {Math.min(videoQueue.completed, videoQueue.total)}/{videoQueue.total}</span></div> : null}

      {!items.length ? (
        <Empty className="workspace-empty director-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有镜头">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>加入第一镜</Button>
        </Empty>
      ) : (
        <div className="director-workbench">
          <aside className="director-shot-strip" aria-label="镜头带">
            <div className="director-rail-header"><strong>镜头带</strong><Tag>{items.length}</Tag></div>
            <div className="director-shot-list">{items.map((item) => (
              <ShotCard
                key={item.id}
                item={item}
                active={item.id === selectedId}
                onClick={() => setSelectedId(item.id)}
                onRemove={() => void remove(item.id)}
              />
            ))}</div>
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => void create()}>加入镜头</Button>
          </aside>

          <div className="director-workbench-main">
            <main className="director-stage">
              {selected ? <>
                <div className="director-stage-toolbar">
                  <div><strong>{selected.title || '未命名镜头'}</strong><span className="stage-muted">{selected.shot_size || '景别待定'}</span></div>
                  <ReviewTags item={selected} />
                  <Space size={4}>
                    <Button type="text" icon={<LeftOutlined />} disabled={selectedIndex <= 0} onClick={() => selectRelative(-1)} />
                    <Button type="text" icon={<RightOutlined />} disabled={selectedIndex < 0 || selectedIndex >= items.length - 1} onClick={() => selectRelative(1)} />
                  </Space>
                </div>
                <div className="director-media-split">
                  <section className="director-media-panel">
                    <div className="director-media-panel-heading"><strong>分镜图</strong><span>{imageReady ? '已完成' : '待生成'}</span></div>
                    <div className="director-frame-area">
                      <div className="director-frame-wrap">
                        {selected.image_url
                          ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.title || '分镜图'} className="director-frame-image" />
                          : <div className="director-frame-empty">
                            <strong>这一镜还没有分镜图</strong>
                            <span>在右侧栏上传或生成</span>
                            {imageTrack ? <GenerationElapsedTime startedAt={imageTrack.startedAt} finishedAt={imageTrack.finishedAt} active={imageBusy} progress={imageTrack.progress} message={imageTrack.message} /> : null}
                          </div>}
                      </div>
                    </div>
                  </section>
                  <section className="director-media-panel director-video-panel">
                    <div className="director-media-panel-heading">
                      <strong>镜头视频</strong>
                      <span>{videoReady ? '已完成' : videoBusy ? (videoTrack?.message || '正在生成') : '待生成'}</span>
                    </div>
                    <div className="director-frame-area">
                      <div className="director-frame-wrap">
                        {selected.video_url
                          ? <video controls src={mediaUrl(selected.video_url)} className="director-frame-video" />
                          : <div className="director-frame-empty">
                            <strong>这一镜还没有视频</strong>
                            <span>以当前分镜图为首帧，在右侧生成</span>
                            {videoTrack ? <GenerationElapsedTime startedAt={videoTrack.startedAt} finishedAt={videoTrack.finishedAt} active={videoBusy} progress={videoTrack.progress} message={videoTrack.message} /> : null}
                          </div>}
                      </div>
                    </div>
                  </section>
                </div>
                <div className="director-asset-palette">
                  <div className="director-palette-heading"><strong>本镜资产</strong><span>{selectedAssetIds.length} 项已选择</span></div>
                  {(['character', 'scene', 'prop'] as AssetKind[]).map((kind) => {
                    const kindAssets = assets.filter((asset) => asset.kind === kind)
                    const selectedIds = kind === 'character' ? characterAssetIds : kind === 'scene' ? sceneAssetIds : propAssetIds
                    return <section className="director-palette-group" key={kind}>
                      <span>{assetLabels[kind]}</span>
                      <div>{kindAssets.length ? kindAssets.map((asset) => <button type="button" key={asset.id} aria-pressed={selectedIds.includes(asset.id)} className={`director-palette-item${selectedIds.includes(asset.id) ? ' is-selected' : ''}`} onClick={() => toggleAsset(kind, asset.id)}>
                        {asset.image_url ? <img src={mediaUrl(asset.image_url)} alt={asset.name} /> : <span className="director-palette-placeholder" aria-hidden="true" />}
                        <strong>{asset.name}</strong>
                      </button>) : <em>暂无{assetLabels[kind]}资产</em>}</div>
                    </section>
                  })}
                </div>
              </> : <Empty description="选择一镜" />}
            </main>

            <aside className="director-inspector">
              {selected ? <Form form={form} layout="vertical" className="director-form">
                <div className="director-inspector-heading">
                  <strong>{selected.title || '未命名镜头'}</strong>
                  <Tag color={imageReady ? 'green' : 'default'}>{imageReady ? '已有分镜图' : '待出图'}</Tag>
                  <ReviewTags item={selected} />
                </div>
                <Collapse bordered={false} defaultActiveKey={['story', 'camera', 'generation', 'recipes']} expandIconPosition="end">
                <Collapse.Panel key="story" header="叙事">
                  <Form.Item name="title" label="标题"><Input placeholder="例如：意外闯入" /></Form.Item>
                  <Form.Item name="description" label="剧情"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="这一镜发生什么？" /></Form.Item>
                  <div className="director-form-grid"><Form.Item name="action" label="动作"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可留空" /></Form.Item><Form.Item name="dialogue" label="对白"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可留空" /></Form.Item></div>
                </Collapse.Panel>
                <Collapse.Panel key="camera" header="镜头语言">
                  <div className="director-form-grid director-form-grid-three"><Form.Item name="shot_size" label="景别"><Input placeholder="远景 / 中景 / 近景" /></Form.Item><Form.Item name="camera_angle" label="机位"><Input placeholder="平视 / 俯拍" /></Form.Item><Form.Item name="camera_movement" label="运镜"><Input placeholder="固定 / 推 / 拉" /></Form.Item></div>
                  <Form.Item name="composition" label="构图"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="主体位置、前中后景" /></Form.Item>
                  <div className="director-form-grid director-form-grid-three"><Form.Item name="lighting" label="光线"><Input placeholder="雨夜霓虹" /></Form.Item><Form.Item name="mood" label="氛围"><Input placeholder="紧张 / 克制" /></Form.Item><Form.Item name="sound" label="声音"><Input placeholder="环境声 / 音效" /></Form.Item></div>
                </Collapse.Panel>
                <Collapse.Panel key="generation" header="提示词素材">
                  <Form.Item name="image_prompt" label="图片描述"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="静态画面内容；留空时使用剧情或标题" /></Form.Item>
                  <Form.Item name="video_prompt" label="视频描述"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="镜头运动内容；留空时使用剧情或标题" /></Form.Item>
                  <div className="asset-reference-heading"><span>本镜额外参考图 · {extraReferences.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
                    try { await uploadExtraReference(file as File); onSuccess?.(file) }
                    catch (reason) { onError?.(reason as Error) }
                  }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
                  <div className="asset-reference-grid">{extraReferences.length ? extraReferences.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除本镜参考图" onClick={() => form.setFieldValue('extra_reference_images', extraReferences.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">还没有本镜额外参考图</span>}</div>
                </Collapse.Panel>
                <Collapse.Panel key="recipes" header="图片与视频提示词">
                  <Button className="director-assemble-button" block icon={<BuildOutlined />} loading={assemblingId === selected.id} onClick={() => void assembleRecipes()}>组装提示词</Button>
                  <Form.Item name="image_recipe_prompt" label="图片最终提示词">
                    <Input.TextArea autoSize={{ minRows: 6, maxRows: 18 }} placeholder="填写图片提示词" />
                  </Form.Item>
                  <RecipeReferences label="图片参考图" values={imageRecipeReferences} />
                  <Form.Item name="video_recipe_prompt" label="视频最终提示词">
                    <Input.TextArea autoSize={{ minRows: 6, maxRows: 18 }} placeholder="填写视频提示词" />
                  </Form.Item>
                  <RecipeReferences label="视频参考图" values={videoRecipeReferences} />
                  {aspectOptions.length ? (
                    <Form.Item name="aspect_ratio" label="图片画幅">
                      <Select options={aspectOptions.map((value) => ({ value, label: value }))} placeholder="请选择画幅" />
                    </Form.Item>
                  ) : (
                    <Typography.Text type="secondary">当前模型无可选图片画幅</Typography.Text>
                  )}
                  {imageTrack ? <GenerationElapsedTime startedAt={imageTrack.startedAt} finishedAt={imageTrack.finishedAt} active={imageBusy} progress={imageTrack.progress} message={imageTrack.message} /> : null}
                </Collapse.Panel>
                </Collapse>
                <div className="director-inspector-actions">
                  <div className="director-video-params">
                    {durationOptions.length ? (
                      <label>
                        <span>视频时长</span>
                        <Select
                          size="small"
                          value={shotDurations[selected.id]}
                          options={durationOptions.map((value) => ({ value, label: `${value} 秒` }))}
                          onChange={(value) => setShotDurations((current) => ({ ...current, [selected.id]: value }))}
                          disabled={videoBusy}
                        />
                      </label>
                    ) : null}
                    {videoAspectOptions.length ? (
                      <label>
                        <span>视频画幅</span>
                        <Select
                          size="small"
                          value={shotAspects[selected.id]}
                          options={videoAspectOptions.map((value) => ({ value, label: aspectRatioLabel(value) }))}
                          onChange={(value) => setShotAspects((current) => ({ ...current, [selected.id]: value }))}
                          disabled={videoBusy}
                        />
                      </label>
                    ) : (
                      <Typography.Text type="secondary">当前模型无可选视频画幅</Typography.Text>
                    )}
                  </div>
                  {videoTrack ? <GenerationElapsedTime startedAt={videoTrack.startedAt} finishedAt={videoTrack.finishedAt} active={videoBusy} progress={videoTrack.progress} message={videoTrack.message} /> : null}
                  {selectedReadiness?.video.warning ? <Typography.Text type="warning">{selectedReadiness.video.warning}</Typography.Text> : null}
                  {!selectedReadiness?.video.ready && selectedReadiness?.video.reason ? <Typography.Text type="danger">{selectedReadiness.video.reason}</Typography.Text> : null}
                  {videoBusy
                    ? <Button danger block onClick={() => void tracker.cancel(storyboardVideoKey(selected.id))}>停止生成视频</Button>
                    : <Button type="primary" block disabled={!selectedReadiness?.video.ready} onClick={() => void generateVideo(selected.id)}>{videoReady ? '重新生成视频' : '生成视频'}</Button>}
                  <Upload
                    className="director-action-upload"
                    showUploadList={false}
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    disabled={imageBusy}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      try {
                        await uploadImage(file as File)
                        onSuccess?.(file)
                      } catch (reason) { onError?.(reason as Error) }
                    }}
                  >
                    <Button block disabled={imageBusy}>{imageReady ? '重新上传分镜图' : '上传分镜图'}</Button>
                  </Upload>
                  {imageBusy
                    ? <Button danger block onClick={() => void tracker.cancel(storyboardImageKey(selected.id))}>停止生成分镜图</Button>
                    : <Button type="primary" block loading={imageBusy} disabled={!selectedReadiness?.image.ready} onClick={() => void generateImage()}>{imageReady ? '重做分镜图' : '生成分镜图'}</Button>}
                  {!selectedReadiness?.image.ready && selectedReadiness?.image.reason ? <Typography.Text type="danger">{selectedReadiness.image.reason}</Typography.Text> : null}
                  {selected.image_needs_review ? <Button block onClick={() => void confirmReview('image')}>确认图片通过</Button> : null}
                  {selected.video_needs_review ? <Button block onClick={() => void confirmReview('video')}>确认视频通过</Button> : null}
                  {imageReady ? (
                    <Popconfirm title="清除这一镜的分镜图？" onConfirm={() => void clearImage()}>
                      <Button danger block disabled={imageBusy}>清除分镜图</Button>
                    </Popconfirm>
                  ) : null}
                  <Popconfirm title="删除这个镜头？删除后不可恢复。" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => void remove()}>
                    <Button danger block>删除镜头</Button>
                  </Popconfirm>
                  <Button type="primary" block loading={saving} onClick={() => void save()}>保存</Button>
                </div>
              </Form> : <Empty description="选择镜头后编辑" />}
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewTags({ item }: { item: Storyboard }) {
  if (!item.image_needs_review && !item.video_needs_review && !item.recipe_needs_reassembly) return null
  return <Space size={4} wrap>
    {item.recipe_needs_reassembly ? <Tag color="orange">配方待重装</Tag> : null}
    {item.image_needs_review ? <Tag color="gold">图片待复核</Tag> : null}
    {item.video_needs_review ? <Tag color="gold">视频待复核</Tag> : null}
  </Space>
}

function ShotCard({
  item,
  active,
  onClick,
  onRemove,
}: {
  item: Storyboard
  active: boolean
  onClick: () => void
  onRemove: () => void
}) {
  return <div className={`director-shot-card${active ? ' is-active' : ''}`}>
    <button type="button" className="director-shot-card-main" onClick={onClick}>
      <div className="director-shot-thumb">{item.image_url ? <img src={mediaUrl(item.image_url)} alt="" /> : <span>{item.storyboard_number}</span>}<div className="shot-status-dots"><i className={item.image_url ? 'is-ready' : ''} /><i className={item.video_url ? 'is-ready is-video' : ''} /></div></div>
      <div className="director-shot-copy"><div><strong>{item.storyboard_number}</strong><span>{item.title || '未命名镜头'}</span></div><small>{item.shot_size || '景别待定'}</small><ReviewTags item={item} />{item.dialogue && <em>“{item.dialogue}”</em>}</div>
    </button>
    <Popconfirm title="删除这个镜头？" okText="删除" okButtonProps={{ danger: true }} onConfirm={onRemove}>
      <Button
        type="text"
        size="small"
        danger
        className="director-shot-remove"
        icon={<DeleteOutlined />}
        aria-label={`删除镜头 ${item.storyboard_number}`}
        onClick={(event) => event.stopPropagation()}
      />
    </Popconfirm>
  </div>
}

function RecipeReferences({ label, values }: { label: string; values: string[] }) {
  return <div className="director-recipe-references">
    <div><strong>{label}</strong><span>{values.length} 张</span></div>
    {values.length ? <div>{values.map((url) => <Image key={url} width={56} height={56} src={mediaUrl(url)} preview={{ mask: '查看' }} />)}</div> : <Typography.Text type="secondary">暂无参考图</Typography.Text>}
  </div>
}

function storyboardPayload(values: StoryboardFormValues): Partial<Storyboard> {
  const { character_asset_ids, scene_asset_ids, prop_asset_ids, aspect_ratio: _aspectRatio, ...fields } = values
  return {
    ...fields,
    project_asset_ids: [...(character_asset_ids ?? []), ...(scene_asset_ids ?? []), ...(prop_asset_ids ?? [])],
  }
}

function filterAssetIds(value: number[] | undefined, assets: ProjectAsset[], kind: AssetKind): number[] {
  const allowed = new Set(assets.filter((item) => item.kind === kind).map((item) => item.id))
  return (value ?? []).filter((id) => allowed.has(id))
}
