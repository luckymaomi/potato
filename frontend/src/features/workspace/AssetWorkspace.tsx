import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  HistoryOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App, Button, Dropdown, Empty, Form, Image, Input, List, Popconfirm, Select, Space, Spin, Tag, Typography, Upload, type FormInstance } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mediaHistoryApi, uploadsApi, type MediaGenerationHistory } from '../../api/media'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { GenerationElapsedTime } from '../generation/GenerationElapsedTime'
import { useAnnounceGenerationOutcomes } from '../generation/useAnnounceGenerationOutcomes'
import { assetImageKey, useGenerationTracker } from '../generation/useGenerationTracker'
import type { AssetKind, ProjectAsset } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

type AssetFilter = 'all' | AssetKind

const labels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }
const untaggedFilter = '__untagged__'

export function AssetWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [allAssets, setAllAssets] = useState<ProjectAsset[]>([])
  const [history, setHistory] = useState<MediaGenerationHistory[]>([])
  const [selectedId, setSelectedId] = useState<number>()
  const [activeKind, setActiveKind] = useState<AssetFilter>(() => parseKindFilter(searchParams.get('kind')))
  const [activeTag, setActiveTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [references, setReferences] = useState<string[]>([])
  const [form] = Form.useForm<Partial<ProjectAsset>>()
  const tracker = useGenerationTracker(project.id)
  useAnnounceGenerationOutcomes(tracker.tracks)
  const selected = useMemo(() => allAssets.find((item) => item.id === selectedId), [allAssets, selectedId])
  const itemHistory = useMemo(() => history.filter((item) => item.project_asset_id === selected?.id), [history, selected?.id])
  const selectedTrack = selected ? tracker.get(assetImageKey(selected.id)) : undefined
  const generating = selectedTrack?.status === 'pending' || selectedTrack?.status === 'processing'
  const allTags = useMemo(() => [...new Set(allAssets.flatMap((item) => item.tags ?? []))].sort((left, right) => left.localeCompare(right, 'zh-CN')), [allAssets])
  const filteredAssets = useMemo(() => allAssets.filter((item) => {
    if (activeKind !== 'all' && item.kind !== activeKind) return false
    if (activeTag === untaggedFilter) return !(item.tags?.length)
    return !activeTag || item.tags?.includes(activeTag)
  }), [activeKind, activeTag, allAssets])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [assets, generations] = await Promise.all([
        workspaceApi.assets(project.id),
        mediaHistoryApi.images(project.id),
      ])
      setAllAssets(assets.items)
      setHistory(generations.items)
      setSelectedId((current) => assets.items.some((item) => item.id === current) ? current : undefined)
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setLoading(false)
    }
  }, [message, modal, project.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => { form.setFieldsValue(selected ?? {}) }, [form, selected])
  useEffect(() => { setReferences([]) }, [selected?.id])

  const changeKind = (value: AssetFilter) => {
    setActiveKind(value)
    setSearchParams(value === 'all' ? { episode_id: String(episode.id) } : { episode_id: String(episode.id), kind: value })
  }

  const create = async (kind: AssetKind) => {
    try {
      const created = await workspaceApi.createAsset(project.id, { kind, name: `未命名${labels[kind]}` })
      await load()
      setSelectedId(created.id)
      notifyAppSuccess(message, `已加入${labels[kind]}资产`)
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const save = async (announce = true) => {
    if (!selected) return
    try {
      await workspaceApi.updateAsset(project.id, selected.id, form.getFieldsValue())
      await load()
      if (announce) notifyAppSuccess(message, '资产已保存')
    } catch (reason) {
      if (announce) notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  const generate = async () => {
    if (!selected) return
    try {
      await save(false)
      const values = form.getFieldsValue()
      const generation = await workspaceApi.generateAssetImage(project.id, selected.id, {
        prompt: values.prompt ?? '',
        reference_images: references,
      })
      if (!generation.task_id) {
        notifyAppError({ message, modal }, new Error('已提交但未返回任务号，请打开「AI 配置」确认密钥与模型目录后重试'))
        return
      }
      tracker.watch({
        key: assetImageKey(selected.id),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: 'image',
        startedAt: generation.created_at,
      })
      notifyAppSuccess(message, '已开始生成资产图，可随时停止')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const remove = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await workspaceApi.removeAsset(project.id, selected.id)
      setSelectedId(undefined)
      await load()
      notifyAppSuccess(message, '资产已删除')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setDeleting(false)
    }
  }

  const selectVersion = async (generationId: number) => {
    if (!selected) return
    try {
      await mediaHistoryApi.selectImage(generationId)
      await load()
      notifyAppSuccess(message, '已选用这张图片')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const uploadStandard = async (file: File) => {
    if (!selected) return
    try {
      await workspaceApi.uploadAssetImage(project.id, selected.id, file, form.getFieldValue('prompt'))
      await load()
      notifyAppSuccess(message, '已上传为标准图')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  useEffect(() => {
    const settled = Object.values(tracker.tracks)
      .filter((item) => item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
      .map((item) => `${item.key}:${item.status}:${item.finishedAt ?? ''}`)
      .join('|')
    if (!settled) return
    const timer = window.setTimeout(() => { void load() }, 350)
    return () => window.clearTimeout(timer)
  }, [load, tracker.tracks])

  const kindItems = Object.entries(labels).map(([key, label]) => ({ key, label }))
  const typeOptions = [
    { value: 'all', label: `全部 ${allAssets.length}` },
    ...Object.entries(labels).map(([value, label]) => ({ value, label: `${label} ${allAssets.filter((item) => item.kind === value).length}` })),
  ]

  return (
    <div className="workspace-column asset-gallery-room">
      <div className="workspace-section-heading">
        <Typography.Title level={2}>资产图</Typography.Title>
        <Space wrap>
          <Dropdown menu={{ items: kindItems, onClick: ({ key }) => void create(key as AssetKind) }}>
            <Button type="primary" icon={<PlusOutlined />}>新建资产 <DownOutlined /></Button>
          </Dropdown>
        </Space>
      </div>

      <div className="asset-panel-layout">
        <div className="asset-panel-content">
          <div className="asset-gallery-toolbar">
            <div className="asset-kind-filters" aria-label="资产类型">
              {typeOptions.map((option) => <button type="button" key={String(option.value)} className={activeKind === option.value ? 'is-active' : ''} aria-pressed={activeKind === option.value} onClick={() => changeKind(option.value as AssetFilter)}>{option.label}</button>)}
            </div>
            <span>{filteredAssets.length} 张资产图</span>
          </div>

          <div className="asset-tag-filter" aria-label="资产标签筛选">
            <button type="button" className={!activeTag ? 'is-active' : ''} onClick={() => setActiveTag('')}>全部标签</button>
            {allTags.map((tag) => <button type="button" key={tag} className={activeTag === tag ? 'is-active' : ''} onClick={() => setActiveTag(tag)}>{tag}</button>)}
            <button type="button" className={activeTag === untaggedFilter ? 'is-active' : ''} onClick={() => setActiveTag(untaggedFilter)}>未分类</button>
          </div>

          <div className="asset-gallery-scroll">
            <Spin spinning={loading}>
              {filteredAssets.length ? <div className="asset-gallery-grid">{filteredAssets.map((item) => (
            <button type="button" className="asset-tile" key={item.id} onClick={() => setSelectedId(item.id)}>
              <div className="asset-tile-image">
                {item.image_url ? <img src={mediaUrl(item.image_url)} alt={item.name} /> : <div className="asset-tile-empty"><SafetyCertificateOutlined /><span>待生成标准图</span></div>}
                <span className="asset-tile-status">{item.image_url ? '已有标准图' : '待生成'}</span>
              </div>
              <div className="asset-tile-body">
                <strong>{item.name}</strong>
                <p>{item.visual_description || '还没有图片描述'}</p>
                <div className="asset-tile-tags">{item.tags?.length ? item.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>未分类</span>}</div>
              </div>
            </button>
              ))}</div> : !loading ? <Empty className="asset-gallery-empty" description="当前分类没有资产图"><Dropdown menu={{ items: kindItems, onClick: ({ key }) => void create(key as AssetKind) }}><Button type="primary" icon={<PlusOutlined />}>新建资产</Button></Dropdown></Empty> : null}
            </Spin>
          </div>
        </div>
        <AssetDetailPanel
          selected={selected}
          form={form}
          history={itemHistory}
          references={references}
          projectId={project.id}
          generating={generating}
          deleting={deleting}
          allTags={allTags}
          track={selectedTrack}
          onSave={() => void save()}
          onRemove={() => void remove()}
          onGenerate={() => void generate()}
          onStop={() => selected && void tracker.cancel(assetImageKey(selected.id))}
          onSelectVersion={(id) => void selectVersion(id)}
          onUploadStandard={(file) => uploadStandard(file)}
          onReferencesChange={setReferences}
        />
      </div>
    </div>
  )
}

function AssetDetailPanel({
  selected,
  form,
  history,
  references,
  projectId,
  generating,
  deleting,
  allTags,
  track,
  onSave,
  onRemove,
  onGenerate,
  onStop,
  onSelectVersion,
  onUploadStandard,
  onReferencesChange,
}: {
  selected?: ProjectAsset
  form: FormInstance<Partial<ProjectAsset>>
  history: MediaGenerationHistory[]
  references: string[]
  projectId: number
  generating: boolean
  deleting: boolean
  allTags: string[]
  track?: { startedAt: string; finishedAt?: string; status: string; progress?: number; message?: string }
  onSave: () => void
  onRemove: () => void
  onGenerate: () => void
  onStop: () => void
  onSelectVersion: (id: number) => void
  onUploadStandard: (file: File) => Promise<void>
  onReferencesChange: (values: string[]) => void
}) {
  if (!selected) return <aside className="asset-detail-panel asset-detail-panel-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一张资产图查看详情" /></aside>
  const active = track?.status === 'pending' || track?.status === 'processing'
  return <aside className="asset-detail-panel">
    <div className="asset-detail-header"><div><span>当前资产</span><strong>{selected.name}</strong></div><Button type="primary" onClick={onSave}>保存</Button></div>
    <div className="asset-detail-scroll">
      <Form form={form} layout="vertical" className="asset-detail-form">
        <div className="asset-standard-stage">
          {selected.image_url ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.name} /> : <div className="asset-standard-empty"><SafetyCertificateOutlined /><strong>还没有标准图</strong><span>可上传本地图，或用 AI 生成</span></div>}
          <div className="asset-standard-status">
            <Tag color={selected.image_url ? 'green' : 'default'}>{selected.image_url ? '标准图' : '等待上传或生成'}</Tag>
            <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" customRequest={async ({ file, onSuccess, onError }) => {
              try {
                await onUploadStandard(file as File)
                onSuccess?.(file)
              } catch (reason) { onError?.(reason as Error) }
            }}>
              <Button size="small" icon={<CloudUploadOutlined />}>上传标准图</Button>
            </Upload>
          </div>
        </div>
        <Form.Item name="name" label="名称"><Input /></Form.Item>
        <Form.Item name="visual_description" label="图片描述"><Input.TextArea autoSize={{ minRows: 5, maxRows: 9 }} placeholder="描述标准图中真实呈现的内容。" /></Form.Item>
        <Form.Item name="tags" label="分类标签"><Select mode="tags" allowClear tokenSeparators={[',', '，']} options={allTags.map((tag) => ({ value: tag, label: tag }))} placeholder="输入标签后回车，可添加多个" /></Form.Item>
        <section className="asset-generation-panel">
          <div className="asset-panel-heading"><strong>生成图片</strong><RobotOutlined /></div>
          {track ? <GenerationElapsedTime startedAt={track.startedAt} finishedAt={track.finishedAt} active={active} progress={track.progress} message={track.message} /> : null}
          <Form.Item name="prompt" label="生成提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="可只写提示词，也可以只上传参考图。" /></Form.Item>
          <div className="asset-reference-heading"><span>参考图 · {references.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
            try {
              const uploaded = await uploadsApi.image(file as File, projectId)
              onReferencesChange([...references, uploaded.url])
              onSuccess?.(uploaded)
            } catch (reason) { onError?.(reason as Error) }
          }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
          <div className="asset-reference-grid">{references.length ? references.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除参考图" onClick={() => onReferencesChange(references.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">还没有参考图</span>}</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="primary" block loading={generating} onClick={onGenerate}>{references.length ? '按参考图生成' : '生成图片'}</Button>
            {active ? <Button block danger icon={<StopOutlined />} onClick={onStop}>停止生成</Button> : null}
          </Space>
        </section>
        <section className="asset-history-panel">
          <div className="asset-panel-heading"><strong>图片历史</strong><HistoryOutlined /></div>
          <List size="small" locale={{ emptyText: '还没有生成历史' }} dataSource={history} renderItem={(item) => <List.Item actions={item.status === 'completed' && item.available ? [<Button key="select" size="small" onClick={() => onSelectVersion(item.id)}>选用这张</Button>] : []}>
            <List.Item.Meta
              avatar={item.image_url ? <Image width={48} height={48} src={mediaUrl(item.image_url)} /> : undefined}
              title={<Space size={5}><Tag>{item.status}</Tag><span>{item.provider === 'local-upload' ? '本地上传' : (item.provider ?? '未提交')}</span></Space>}
              description={item.status === 'pending' || item.status === 'processing'
                ? <GenerationElapsedTime startedAt={item.created_at} active progress={undefined} message="进行中" />
                : item.status === 'failed' ? item.error_msg : item.prompt || '无提示词'}
            />
          </List.Item>} />
        </section>
        <Popconfirm title="删除这个资产？" description="分镜中的引用也会移除。" okText="删除" cancelText="取消" onConfirm={onRemove}><Button danger icon={<DeleteOutlined />} loading={deleting}>删除资产</Button></Popconfirm>
      </Form>
    </div>
  </aside>
}

function parseKindFilter(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}
