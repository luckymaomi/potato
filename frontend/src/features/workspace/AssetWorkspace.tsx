import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App, Button, Dropdown, Empty, Form, Image, Input, List, Popconfirm, Select, Space, Spin, Tag, Typography, Upload, type FormInstance } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mediaHistoryApi, uploadsApi, type MediaGenerationHistory } from '../../api/media'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import type { AssetKind, AssetOutputType, AssetTextProfile, ProjectAsset } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { GenerationElapsedTime } from '../generation/GenerationElapsedTime'
import { useAnnounceGenerationOutcomes } from '../generation/useAnnounceGenerationOutcomes'
import { assetImageKey, useGenerationTracker } from '../generation/useGenerationTracker'
import { useProjectWorkspace } from './workspaceContext'

type AssetFilter = 'all' | AssetKind
interface AssetFormValues {
  name?: string
  text_profile?: AssetTextProfile
  output_type?: AssetOutputType
  input_reference_images?: string[]
}

interface ProfileField {
  key: string
  label: string
  list?: boolean
  multiline?: boolean
}

interface ProfileGroup {
  title: string
  fields: ProfileField[]
}

const labels: Record<AssetKind, string> = { character: '角色卡', scene: '场景卡', prop: '道具卡' }
const outputOptions: Record<AssetKind, Array<{ value: AssetOutputType; label: string }>> = {
  character: [
    { value: 'character-layout-a', label: '布局 A · 三栏三视图' },
    { value: 'character-layout-b', label: '布局 B · 左脸右身' },
    { value: 'character-layout-c', label: '布局 C · 4+3 双层' },
    { value: 'character-layout-d', label: '布局 D · 7 图锚点组' },
  ],
  scene: [
    { value: 'scene-panorama', label: '空间全景图' },
    { value: 'scene-detail', label: '局部特写图' },
    { value: 'scene-lighting-variant', label: '光影变体卡（独立资产）' },
  ],
  prop: [
    { value: 'prop-multi-angle', label: '多角度图' },
    { value: 'prop-state-variant', label: '状态变体卡（独立资产）' },
  ],
}
const outputLabels = Object.fromEntries(
  Object.values(outputOptions).flat().map((option) => [option.value, option.label]),
) as Record<AssetOutputType, string>
const profileGroups: Record<AssetKind, ProfileGroup[]> = {
  character: [
    { title: '身份', fields: [field('age', '年龄'), field('gender', '性别'), field('occupation', '职业'), field('faction', '阵营'), listField('identity_tags', '身份标签')] },
    { title: '外形', fields: [field('face_shape', '脸型'), field('facial_features', '五官', true), field('hairstyle', '发型'), field('body_type', '体型'), field('skin_tone', '肤色')] },
    { title: '服装与神态', fields: [field('default_outfit', '默认穿搭', true), field('personality', '性格'), field('common_expressions', '常见表情'), field('aura', '气场')] },
    { title: '声音', fields: [field('voice_tone_id', '音色 ID'), field('speech_rate', '语速'), field('accent', '口音'), field('signature_phrase', '标志性语气', true)] },
  ],
  scene: [
    { title: '空间', fields: [field('location_type', '地点类型'), field('layout', '布局', true), field('architectural_style', '建筑风格'), field('scale', '尺寸比例')] },
    { title: '光影', fields: [field('time_of_day', '时间段'), field('light_source', '光源'), field('color_temperature', '色温'), field('contrast', '明暗对比')] },
    { title: '陈设', fields: [listField('key_furniture', '关键家具'), listField('props', '道具'), listField('decorations', '装饰'), listField('vegetation', '植被')] },
    { title: '氛围', fields: [field('palette', '色调'), field('emotion', '情绪'), field('weather', '天气')] },
  ],
  prop: [
    { title: '物理', fields: [field('category', '类别'), field('size', '尺寸'), field('material', '材质'), field('color', '颜色'), field('shape', '形状')] },
    { title: '细节', fields: [field('condition', '新旧程度'), field('special_marks', '特殊标记', true), field('unique_design', '独特设计', true)] },
    { title: '状态', fields: [field('default_state', '默认状态'), listField('interaction_states', '互动状态'), listField('bindings', '绑定关系')] },
  ],
}

export function AssetWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [allAssets, setAllAssets] = useState<ProjectAsset[]>([])
  const [history, setHistory] = useState<MediaGenerationHistory[]>([])
  const [selectedId, setSelectedId] = useState<number>()
  const [activeKind, setActiveKind] = useState<AssetFilter>(() => parseKindFilter(searchParams.get('kind')))
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [assetQueue, setAssetQueue] = useState<{ total: number; completed: number; current?: string; stopping?: boolean }>()
  const stopAssetQueueRef = useRef(false)
  const currentAssetQueueKeyRef = useRef<string>()
  const [form] = Form.useForm<AssetFormValues>()
  const references = Form.useWatch('input_reference_images', { form, preserve: true }) ?? []
  const tracker = useGenerationTracker(project.id)
  useAnnounceGenerationOutcomes(tracker.tracks)
  const selected = useMemo(() => allAssets.find((item) => item.id === selectedId), [allAssets, selectedId])
  const itemHistory = useMemo(() => history.filter((item) => item.project_asset_id === selected?.id), [history, selected?.id])
  const selectedTrack = selected ? tracker.get(assetImageKey(selected.id)) : undefined
  const generating = selectedTrack?.status === 'pending' || selectedTrack?.status === 'processing'
  const filteredAssets = useMemo(() => allAssets.filter((item) => activeKind === 'all' || item.kind === activeKind), [activeKind, allAssets])

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
  useEffect(() => {
    if (selected) form.setFieldsValue({
      name: selected.name,
      text_profile: selected.text_profile,
      output_type: selected.output_type,
      input_reference_images: selected.input_reference_images,
    })
    else form.resetFields()
  }, [form, selected])

  const changeKind = (value: AssetFilter) => {
    setActiveKind(value)
    setSearchParams(value === 'all' ? { episode_id: String(episode.id) } : { episode_id: String(episode.id), kind: value })
  }

  const create = async (kind: AssetKind) => {
    try {
      const created = await workspaceApi.createAsset(project.id, { kind, name: `未命名${labels[kind]}` })
      await load()
      setSelectedId(created.id)
      notifyAppSuccess(message, `已新建${labels[kind]}`)
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const save = async (announce = true) => {
    if (!selected) return
    try {
      await workspaceApi.updateAsset(project.id, selected.id, form.getFieldsValue(true))
      await load()
      if (announce) notifyAppSuccess(message, '资产卡已保存')
    } catch (reason) {
      if (announce) notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  const generate = async () => {
    if (!selected) return
    try {
      await save(false)
      const generation = await workspaceApi.generateAssetImage(project.id, selected.id, {})
      if (!generation.task_id) throw new Error('已提交但未返回任务号，请打开「AI 配置」确认密钥与模型目录后重试')
      tracker.watch({
        key: assetImageKey(selected.id),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: 'image',
        label: selected.name,
        startedAt: generation.created_at,
      })
      notifyAppSuccess(message, '已开始生成标准资产图，可随时停止')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const generatePendingAssets = async () => {
    if (assetQueue) return
    const pending = allAssets.filter((item) => !item.image_url)
    if (!pending.length) {
      message.info('没有待生成的标准资产图')
      return
    }
    stopAssetQueueRef.current = false
    setAssetQueue({ total: pending.length, completed: 0 })
    try {
      for (const item of pending) {
        if (stopAssetQueueRef.current) break
        setAssetQueue((current) => current ? { ...current, current: item.name } : current)
        const key = assetImageKey(item.id)
        currentAssetQueueKeyRef.current = key
        try {
          const generation = await workspaceApi.generateAssetImage(project.id, item.id, {})
          if (!generation.task_id) throw new Error('未返回任务号')
          tracker.watch({ key, taskId: generation.task_id, generationId: generation.id, kind: 'image', label: item.name, startedAt: generation.created_at })
          if (stopAssetQueueRef.current) await tracker.cancel(key)
          await tracker.waitForTerminal(key)
        } catch (reason) {
          if (!stopAssetQueueRef.current) notifyAppError({ message, modal }, reason)
        } finally {
          currentAssetQueueKeyRef.current = undefined
          setAssetQueue((current) => current ? { ...current, completed: current.completed + 1 } : current)
        }
      }
    } finally {
      currentAssetQueueKeyRef.current = undefined
      setAssetQueue(undefined)
      await load()
    }
  }

  const stopPendingAssets = async () => {
    stopAssetQueueRef.current = true
    setAssetQueue((current) => current ? { ...current, stopping: true } : current)
    const key = currentAssetQueueKeyRef.current
    if (key) await tracker.cancel(key)
  }

  const remove = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await workspaceApi.removeAsset(project.id, selected.id)
      setSelectedId(undefined)
      await load()
      notifyAppSuccess(message, '资产卡已删除')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setDeleting(false)
    }
  }

  const selectGeneration = async (generationId: number) => {
    try {
      await mediaHistoryApi.selectImage(generationId)
      await load()
      notifyAppSuccess(message, '已选用这张标准资产图')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  const uploadStandard = async (file: File) => {
    if (!selected) return
    try {
      await workspaceApi.uploadAssetImage(project.id, selected.id, file)
      await load()
      notifyAppSuccess(message, '已上传为标准资产图')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  const uploadInputReference = async (file: File) => {
    const uploaded = await uploadsApi.image(file, project.id)
    form.setFieldValue('input_reference_images', [...new Set([...references, uploaded.url])])
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
        <Typography.Title level={2}>项目资产库</Typography.Title>
        <Space wrap>
          {assetQueue
            ? <Button danger icon={<StopOutlined />} onClick={() => void stopPendingAssets()}>停止逐项生成</Button>
            : <Button icon={<PlayCircleOutlined />} onClick={() => void generatePendingAssets()}>生成未完成标准图</Button>}
          <Dropdown menu={{ items: kindItems, onClick: ({ key }) => void create(key as AssetKind) }}>
            <Button type="primary" icon={<PlusOutlined />}>新建资产卡 <DownOutlined /></Button>
          </Dropdown>
        </Space>
      </div>

      {assetQueue ? <div className="generation-queue-status"><Tag color={assetQueue.stopping ? 'warning' : 'processing'}>{assetQueue.stopping ? '正在停止' : '逐项生成中'}</Tag><span>{assetQueue.current ?? '准备中'} · 已处理 {Math.min(assetQueue.completed, assetQueue.total)}/{assetQueue.total}</span></div> : null}

      <div className="asset-panel-layout">
        <div className="asset-panel-content">
          <div className="asset-gallery-toolbar">
            <div className="asset-kind-filters" aria-label="资产类型">
              {typeOptions.map((option) => <button type="button" key={option.value} className={activeKind === option.value ? 'is-active' : ''} aria-pressed={activeKind === option.value} onClick={() => changeKind(option.value as AssetFilter)}>{option.label}</button>)}
            </div>
            <span>{filteredAssets.length} 张资产卡</span>
          </div>
          <div className="asset-gallery-scroll">
            <Spin spinning={loading}>
              {filteredAssets.length ? <div className="asset-gallery-grid">{filteredAssets.map((item) => (
                <button type="button" className={`asset-tile${item.id === selectedId ? ' is-selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
                  <div className="asset-tile-image">
                    {item.image_url ? <img src={mediaUrl(item.image_url)} alt={item.name} /> : <div className="asset-tile-empty"><SafetyCertificateOutlined /><span>待生成标准图</span></div>}
                    <span className="asset-tile-status">{item.image_url ? '已有标准图' : '待生成'}</span>
                  </div>
                  <div className="asset-tile-body">
                    <strong>{item.name}</strong>
                    <p>{profileSummary(item.text_profile) || '尚未填写文本结构'}</p>
                    <div className="asset-tile-tags"><span>{labels[item.kind]}</span><span>{outputLabels[item.output_type]}</span><span>{item.input_reference_images.length} 张输入参考图</span></div>
                  </div>
                </button>
              ))}</div> : !loading ? <Empty className="asset-gallery-empty" description="当前分类没有资产卡"><Dropdown menu={{ items: kindItems, onClick: ({ key }) => void create(key as AssetKind) }}><Button type="primary" icon={<PlusOutlined />}>新建资产卡</Button></Dropdown></Empty> : null}
            </Spin>
          </div>
        </div>
        <AssetDetailPanel
          selected={selected}
          form={form}
          history={itemHistory}
          references={references}
          generating={generating}
          deleting={deleting}
          track={selectedTrack}
          onSave={() => void save()}
          onRemove={() => void remove()}
          onGenerate={() => void generate()}
          onStop={() => selected && void tracker.cancel(assetImageKey(selected.id))}
          onSelectGeneration={(id) => void selectGeneration(id)}
          onUploadStandard={uploadStandard}
          onUploadInputReference={uploadInputReference}
          onReferencesChange={(values) => form.setFieldValue('input_reference_images', values)}
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
  generating,
  deleting,
  track,
  onSave,
  onRemove,
  onGenerate,
  onStop,
  onSelectGeneration,
  onUploadStandard,
  onUploadInputReference,
  onReferencesChange,
}: {
  selected?: ProjectAsset
  form: FormInstance<AssetFormValues>
  history: MediaGenerationHistory[]
  references: string[]
  generating: boolean
  deleting: boolean
  track?: { startedAt: string; finishedAt?: string; status: string; progress?: number; message?: string }
  onSave: () => void
  onRemove: () => void
  onGenerate: () => void
  onStop: () => void
  onSelectGeneration: (id: number) => void
  onUploadStandard: (file: File) => Promise<void>
  onUploadInputReference: (file: File) => Promise<void>
  onReferencesChange: (values: string[]) => void
}) {
  if (!selected) return <aside className="asset-detail-panel asset-detail-panel-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一张资产卡查看详情" /></aside>
  const active = track?.status === 'pending' || track?.status === 'processing'
  return <aside className="asset-detail-panel">
    <div className="asset-detail-header"><div><span>{labels[selected.kind]}</span><strong>{selected.name}</strong></div><Button type="primary" onClick={onSave}>保存</Button></div>
    <div className="asset-detail-scroll">
      <Form form={form} layout="vertical" className="asset-detail-form">
        <div className="asset-standard-stage">
          {selected.image_url ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.name} /> : <div className="asset-standard-empty"><SafetyCertificateOutlined /><strong>还没有标准资产图</strong><span>可上传本地图，或按卡片输入生成</span></div>}
          <div className="asset-standard-status">
            <Tag color={selected.image_url ? 'green' : 'default'}>{selected.image_url ? '标准资产图' : '等待上传或生成'}</Tag>
            <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" customRequest={async ({ file, onSuccess, onError }) => {
              try { await onUploadStandard(file as File); onSuccess?.(file) }
              catch (reason) { onError?.(reason as Error) }
            }}><Button size="small" icon={<CloudUploadOutlined />}>上传标准图</Button></Upload>
          </div>
        </div>
        <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: '请输入资产卡名称' }]}><Input /></Form.Item>
        <Form.Item name="output_type" label="标准图产出方式" rules={[{ required: true, message: '请选择标准图产出方式' }]}>
          <Select options={outputOptions[selected.kind]} />
        </Form.Item>
        {profileGroups[selected.kind].map((group) => <section className="asset-profile-group" key={group.title}>
          <div className="asset-panel-heading"><strong>{group.title}</strong></div>
          <div className="asset-profile-grid">{group.fields.map((profileField) => <Form.Item key={profileField.key} name={['text_profile', profileField.key]} label={profileField.label}>
            {profileField.list
              ? <Select mode="tags" allowClear tokenSeparators={[',', '，']} placeholder="输入后回车" />
              : profileField.multiline
                ? <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
                : <Input />}
          </Form.Item>)}</div>
        </section>)}
        <section className="asset-generation-panel">
          <div className="asset-panel-heading"><strong>生成标准资产图</strong><RobotOutlined /></div>
          {track ? <GenerationElapsedTime startedAt={track.startedAt} finishedAt={track.finishedAt} active={active} progress={track.progress} message={track.message} /> : null}
          <div className="asset-reference-heading"><span>生成输入参考图 · {references.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
            try { await onUploadInputReference(file as File); onSuccess?.(file) }
            catch (reason) { onError?.(reason as Error) }
          }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
          <div className="asset-reference-grid">{references.length ? references.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除参考图" onClick={() => onReferencesChange(references.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">还没有生成输入参考图</span>}</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="primary" block loading={generating} onClick={onGenerate}>{references.length ? '按文本和参考图生成' : '按文本生成'}</Button>
            {active ? <Button block danger icon={<StopOutlined />} onClick={onStop}>停止生成</Button> : null}
          </Space>
        </section>
        <section className="asset-history-panel">
          <div className="asset-panel-heading"><strong>标准图历史</strong><HistoryOutlined /></div>
          <List size="small" locale={{ emptyText: '还没有生成历史' }} dataSource={history} renderItem={(item) => <List.Item actions={item.status === 'completed' && item.available ? [<Button key="select" size="small" onClick={() => onSelectGeneration(item.id)}>选用这张</Button>] : []}>
            <List.Item.Meta
              avatar={item.image_url ? <Image width={48} height={48} src={mediaUrl(item.image_url)} /> : undefined}
              title={<Space size={5}><Tag>{item.status}</Tag><span>{item.provider === 'local-upload' ? '本地上传' : (item.provider ?? '未提交')}</span></Space>}
              description={item.status === 'pending' || item.status === 'processing'
                ? <GenerationElapsedTime startedAt={item.created_at} active progress={undefined} message="进行中" />
                : item.status === 'failed' ? item.error_msg : item.prompt || '无提示词'}
            />
          </List.Item>} />
        </section>
        <Popconfirm title="删除这个资产卡？" description="分镜中的引用也会移除。" okText="删除" cancelText="取消" onConfirm={onRemove}><Button danger icon={<DeleteOutlined />} loading={deleting}>删除资产卡</Button></Popconfirm>
      </Form>
    </div>
  </aside>
}

function field(key: string, label: string, multiline = false): ProfileField {
  return { key, label, multiline }
}

function listField(key: string, label: string): ProfileField {
  return { key, label, list: true }
}

function profileSummary(profile: AssetTextProfile): string {
  return Object.values(profile).flatMap((value) => Array.isArray(value) ? value : [value]).join(' · ')
}

function parseKindFilter(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}
