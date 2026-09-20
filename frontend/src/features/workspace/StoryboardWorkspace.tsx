import {
  CloudUploadOutlined,
  DeleteOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SaveOutlined,
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
import { uploadsApi } from '../../api/media'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { GenerationElapsedTime } from '../generation/GenerationElapsedTime'
import { useAnnounceGenerationOutcomes } from '../generation/useAnnounceGenerationOutcomes'
import { storyboardImageKey, useGenerationTracker } from '../generation/useGenerationTracker'
import { aspectRatiosFor, preferredAspectRatio } from '../providers/catalog'
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
  const [selectedId, setSelectedId] = useState<number>()
  const [saving, setSaving] = useState(false)
  const [imageModels, setImageModels] = useState<ProviderModel[]>([])
  const [imageModelLabel, setImageModelLabel] = useState('读取中…')
  const [imageQueue, setImageQueue] = useState<{ total: number; completed: number; current?: string; stopping?: boolean }>()
  const stopImageQueueRef = useRef(false)
  const currentImageQueueKeyRef = useRef<string>()
  const [form] = Form.useForm<StoryboardFormValues>()
  const tracker = useGenerationTracker(project.id)
  useAnnounceGenerationOutcomes(tracker.tracks)
  const aspectRatio = Form.useWatch('aspect_ratio', form)
  const characterAssetIds = Form.useWatch('character_asset_ids', { form, preserve: true }) ?? []
  const sceneAssetIds = Form.useWatch('scene_asset_ids', { form, preserve: true }) ?? []
  const propAssetIds = Form.useWatch('prop_asset_ids', { form, preserve: true }) ?? []
  const extraReferences = Form.useWatch('extra_reference_images', { form, preserve: true }) ?? []
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId])
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
      setItems(storyboards.items)
      setAssets(projectAssets.items)
      setSelectedId((current) => storyboards.items.some((item) => item.id === current) ? current : storyboards.items[0]?.id)
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }, [episode.id, message, modal, project.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let active = true
    void Promise.all([aiConfigsApi.models({ service_type: 'image' }), aiConfigsApi.modelPresets()])
      .then(([models, presets]) => {
        if (!active) return
        const preferred = presets.image
        setImageModelLabel(preferred ? `${preferred.provider} / ${preferred.model}` : '自动选择（AI 配置）')
        const filtered = preferred
          ? models.filter((model) => model.provider === preferred.provider && model.id === preferred.model)
          : models
        setImageModels(filtered.length ? filtered : models)
      })
      .catch((reason) => {
        if (!active) return
        setImageModels([])
        setImageModelLabel('未读取到图片预设')
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
      const values = form.getFieldsValue(true)
      const { character_asset_ids, scene_asset_ids, prop_asset_ids, aspect_ratio: _aspect, ...fields } = values
      await workspaceApi.updateStoryboard(project.id, selected.id, {
        ...fields,
        project_asset_ids: [...(character_asset_ids ?? []), ...(scene_asset_ids ?? []), ...(prop_asset_ids ?? [])],
      })
      await load()
      notifyAppSuccess(message, '镜头已保存')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setSaving(false)
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
      const { character_asset_ids, scene_asset_ids, prop_asset_ids, aspect_ratio, ...fields } = values
      await workspaceApi.updateStoryboard(project.id, selected.id, {
        ...fields,
        project_asset_ids: [...(character_asset_ids ?? []), ...(scene_asset_ids ?? []), ...(prop_asset_ids ?? [])],
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

  const generatePendingImages = async () => {
    if (imageQueue) return
    const pending = items.filter((item) => !item.image_url)
    if (!pending.length) {
      message.info('没有待生成的分镜图')
      return
    }
    stopImageQueueRef.current = false
    setImageQueue({ total: pending.length, completed: 0 })
    try {
      for (const item of pending) {
        if (stopImageQueueRef.current) break
        setImageQueue((current) => current ? { ...current, current: item.title || `镜头 ${item.storyboard_number}` } : current)
        const key = storyboardImageKey(item.id)
        currentImageQueueKeyRef.current = key
        try {
          const generation = await workspaceApi.generateStoryboardImage(project.id, item.id)
          if (!generation.task_id) throw new Error('未返回任务号')
          tracker.watch({ key, taskId: generation.task_id, generationId: generation.id, kind: 'image', label: item.title || `镜头 ${item.storyboard_number}`, startedAt: generation.created_at })
          if (stopImageQueueRef.current) await tracker.cancel(key)
          await tracker.waitForTerminal(key)
        } catch (reason) {
          if (!stopImageQueueRef.current) notifyAppError({ message, modal }, reason)
        } finally {
          currentImageQueueKeyRef.current = undefined
          setImageQueue((current) => current ? { ...current, completed: current.completed + 1 } : current)
        }
      }
    } finally {
      currentImageQueueKeyRef.current = undefined
      setImageQueue(undefined)
      await load()
    }
  }

  const stopPendingImages = async () => {
    stopImageQueueRef.current = true
    setImageQueue((current) => current ? { ...current, stopping: true } : current)
    const key = currentImageQueueKeyRef.current
    if (key) await tracker.cancel(key)
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

  const selectRelative = (offset: number) => {
    const next = items[selectedIndex + offset]
    if (next) setSelectedId(next.id)
  }

  const selectedAssetIds = [...characterAssetIds, ...sceneAssetIds, ...propAssetIds]
  const imageReady = Boolean(selected?.image_url)
  const videoReady = Boolean(selected?.video_url)

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
          <div className="director-progress-summary"><strong>{items.length}</strong><span>镜头</span><i /><strong>{items.filter((item) => item.image_url).length}</strong><span>已出图</span></div>
          {imageQueue
            ? <Button danger icon={<StopOutlined />} onClick={() => void stopPendingImages()}>停止逐项生成</Button>
            : <Button icon={<PlayCircleOutlined />} onClick={() => void generatePendingImages()}>生成未完成分镜图</Button>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>加入镜头</Button>
        </Space>
      </div>

      {imageQueue ? <div className="generation-queue-status"><Tag color={imageQueue.stopping ? 'warning' : 'processing'}>{imageQueue.stopping ? '正在停止' : '逐项生成中'}</Tag><span>{imageQueue.current ?? '准备中'} · 已处理 {Math.min(imageQueue.completed, imageQueue.total)}/{imageQueue.total}</span></div> : null}

      {!items.length ? (
        <Empty className="workspace-empty director-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有镜头">
          <Space direction="vertical" align="center"><Typography.Text type="secondary">请手动加入第一镜并填写镜头规格。</Typography.Text><Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>加入第一镜</Button></Space>
        </Empty>
      ) : (
        <div className="director-workbench">
          <aside className="director-shot-strip" aria-label="镜头带">
            <div className="director-rail-header"><div><strong>镜头带</strong><span>按顺序</span></div><Tag>{items.length}</Tag></div>
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
                  <Space size={4}>
                    <Button type="text" icon={<LeftOutlined />} disabled={selectedIndex <= 0} onClick={() => selectRelative(-1)} />
                    <Button type="text" icon={<RightOutlined />} disabled={selectedIndex < 0 || selectedIndex >= items.length - 1} onClick={() => selectRelative(1)} />
                  </Space>
                </div>
                <div className="director-frame-area">
                  <div className="director-frame-wrap">
                    {selected.image_url
                      ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.title || '分镜图'} className="director-frame-image" />
                      : <div className="director-frame-empty">
                        <strong>这一镜还没有分镜图</strong>
                        <span>可上传本地图，或用 AI 生成</span>
                        {imageTrack ? <GenerationElapsedTime startedAt={imageTrack.startedAt} finishedAt={imageTrack.finishedAt} active={imageBusy} progress={imageTrack.progress} message={imageTrack.message} /> : null}
                        <Space wrap>
                          <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" disabled={imageBusy} customRequest={async ({ file, onSuccess, onError }) => {
                            try {
                              await uploadImage(file as File)
                              onSuccess?.(file)
                            } catch (reason) { onError?.(reason as Error) }
                          }}>
                            <Button icon={<CloudUploadOutlined />} disabled={imageBusy}>上传分镜图</Button>
                          </Upload>
                          <Button type="primary" loading={imageBusy} onClick={() => void generateImage()}>生成这一镜</Button>
                          {imageBusy ? <Button danger icon={<StopOutlined />} onClick={() => void tracker.cancel(storyboardImageKey(selected.id))}>停止</Button> : null}
                        </Space>
                      </div>}
                  </div>
                </div>
                {selected.image_url ? (
                  <div className="director-frame-actions">
                    <Space wrap>
                      <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" disabled={imageBusy} customRequest={async ({ file, onSuccess, onError }) => {
                        try {
                          await uploadImage(file as File)
                          onSuccess?.(file)
                        } catch (reason) { onError?.(reason as Error) }
                      }}>
                        <Button size="small" icon={<CloudUploadOutlined />} disabled={imageBusy}>重新上传</Button>
                      </Upload>
                      <Popconfirm title="清除这一镜的分镜图？" onConfirm={() => void clearImage()}>
                        <Button size="small" danger icon={<DeleteOutlined />} disabled={imageBusy}>清除分镜图</Button>
                      </Popconfirm>
                    </Space>
                  </div>
                ) : null}
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
                  <div><span>镜头设置</span><strong>{selected.title || '未命名镜头'}</strong></div>
                  <Tag color={imageReady ? 'green' : 'default'}>{imageReady ? '已有分镜图' : '待出图'}</Tag>
                </div>
                <Collapse bordered={false} defaultActiveKey={['story', 'camera', 'generation']} expandIconPosition="end">
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
                <Collapse.Panel key="generation" header="生成输入">
                  <Form.Item name="image_prompt" label="图像提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="这一镜的静态主体描述" /></Form.Item>
                  <Form.Item name="video_prompt" label="视频提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可选" /></Form.Item>
                  <div className="asset-reference-heading"><span>本镜额外参考图 · {extraReferences.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
                    try { await uploadExtraReference(file as File); onSuccess?.(file) }
                    catch (reason) { onError?.(reason as Error) }
                  }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
                  <div className="asset-reference-grid">{extraReferences.length ? extraReferences.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除本镜参考图" onClick={() => form.setFieldValue('extra_reference_images', extraReferences.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">还没有本镜额外参考图</span>}</div>
                  {aspectOptions.length ? (
                    <Form.Item name="aspect_ratio" label="图片画幅" extra="选项来自当前图片模型目录，不是通用列表">
                      <Select options={aspectOptions.map((value) => ({ value, label: value }))} placeholder="按当前图片模型能力" />
                    </Form.Item>
                  ) : (
                    <Typography.Text type="secondary" className="director-help-copy">当前图片模型目录未声明画幅，生成时不会伪造通用比例。</Typography.Text>
                  )}
                  <Space wrap>
                    <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" disabled={imageBusy} customRequest={async ({ file, onSuccess, onError }) => {
                      try {
                        await uploadImage(file as File)
                        onSuccess?.(file)
                      } catch (reason) { onError?.(reason as Error) }
                    }}>
                      <Button icon={<CloudUploadOutlined />} disabled={imageBusy}>{imageReady ? '重新上传' : '上传分镜图'}</Button>
                    </Upload>
                    <Button type="primary" loading={imageBusy} onClick={() => void generateImage()}>{imageReady ? '重做分镜图' : '生成分镜图'}</Button>
                    {imageBusy ? <Button danger icon={<StopOutlined />} onClick={() => void tracker.cancel(storyboardImageKey(selected.id))}>停止</Button> : null}
                    {imageReady ? <Popconfirm title="清除这一镜的分镜图？" onConfirm={() => void clearImage()}><Button danger disabled={imageBusy}>清除</Button></Popconfirm> : null}
                  </Space>
                  {imageTrack ? <GenerationElapsedTime startedAt={imageTrack.startedAt} finishedAt={imageTrack.finishedAt} active={imageBusy} progress={imageTrack.progress} message={imageTrack.message} /> : null}
                </Collapse.Panel>
                </Collapse>
                <div className="director-inspector-footer">
                  <Space>
                    <Popconfirm title="删除这个镜头？删除后不可恢复。" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => void remove()}>
                      <Button danger icon={<DeleteOutlined />}>删除镜头</Button>
                    </Popconfirm>
                    <Button icon={<SaveOutlined />} type="primary" loading={saving} onClick={() => void save()}>保存</Button>
                  </Space>
                  <span>{videoReady ? '视频已生成' : '视频未生成'}</span>
                </div>
              </Form> : <Empty description="选择镜头后编辑" />}
            </aside>
          </div>
        </div>
      )}
    </div>
  )
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
      <div className="director-shot-copy"><div><strong>{item.storyboard_number}</strong><span>{item.title || '未命名镜头'}</span></div><small>{item.shot_size || '景别待定'}</small>{item.dialogue && <em>“{item.dialogue}”</em>}</div>
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

function filterAssetIds(value: number[] | undefined, assets: ProjectAsset[], kind: AssetKind): number[] {
  const allowed = new Set(assets.filter((item) => item.kind === kind).map((item) => item.id))
  return (value ?? []).filter((id) => allowed.has(id))
}
