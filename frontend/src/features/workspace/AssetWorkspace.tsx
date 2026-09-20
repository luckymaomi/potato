import {
  BuildOutlined,
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
import { assetGenerationStatus, type AssetGenerationState } from './assetGenerationStatus'

type AssetFilter = 'all' | AssetKind
interface AssetFormValues {
  name?: string
  text_profile?: AssetTextProfile
  output_type?: AssetOutputType
  output_prompt?: string
  input_reference_images?: string[]
}

interface ProfileField {
  key: string
  label: string
}

interface ProfileGroup {
  title: string
  fields: ProfileField[]
}

const labels: Record<AssetKind, string> = { character: '角色卡', scene: '场景卡', prop: '道具卡' }
const profileGroups: Record<AssetKind, ProfileGroup[]> = {
  character: [
    { title: '身份', fields: [field('age', '年龄'), field('gender', '性别'), field('occupation', '职业'), field('faction', '阵营')] },
    { title: '外形', fields: [field('face_shape', '脸型'), field('facial_features', '五官'), field('hairstyle', '发型'), field('body_type', '体型'), field('skin_tone', '肤色')] },
    { title: '服装与神态', fields: [field('default_outfit', '默认穿搭'), field('personality', '性格'), field('common_expressions', '常见表情'), field('aura', '气场')] },
    { title: '声音', fields: [field('voice_tone_id', '音色 ID'), field('speech_rate', '语速'), field('accent', '口音'), field('signature_phrase', '标志性语气')] },
  ],
  scene: [
    { title: '空间', fields: [field('location_type', '地点类型'), field('layout', '布局'), field('architectural_style', '建筑风格'), field('scale', '尺寸比例')] },
    { title: '光影', fields: [field('time_of_day', '时间段'), field('light_source', '光源'), field('color_temperature', '色温'), field('contrast', '明暗对比')] },
    { title: '陈设', fields: [field('key_furniture', '陈设'), field('props', '道具'), field('decorations', '装饰'), field('vegetation', '植被')] },
    { title: '氛围', fields: [field('palette', '色调'), field('emotion', '情绪'), field('weather', '天气')] },
  ],
  prop: [
    { title: '物理', fields: [field('category', '类别'), field('size', '尺寸'), field('material', '材质'), field('color', '颜色'), field('shape', '形状')] },
    { title: '细节', fields: [field('condition', '新旧程度'), field('special_marks', '特殊标记'), field('unique_design', '独特设计')] },
    { title: '状态', fields: [field('default_state', '默认状态'), field('interaction_states', '互动状态'), field('bindings', '绑定关系')] },
  ],
}

const outputTypeOptions: Record<AssetKind, Array<{ value: AssetOutputType; label: string }>> = {
  character: [
    { value: 'character-layout-a', label: 'A 三栏三视图' },
    { value: 'character-layout-b', label: 'B 左脸右身' },
    { value: 'character-layout-c', label: 'C 4+3 双层' },
    { value: 'character-layout-d', label: 'D 7 图锚点组' },
  ],
  scene: [
    { value: 'scene-panorama', label: '空间全景' },
    { value: 'scene-detail', label: '局部特写' },
    { value: 'scene-lighting-variant', label: '光影变体' },
  ],
  prop: [
    { value: 'prop-multi-angle', label: '多角度' },
    { value: 'prop-state-variant', label: '状态变体' },
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
  const [assemblingId, setAssemblingId] = useState<number>()
  const [submissions, setSubmissions] = useState<Record<number, AssetGenerationState>>({})
  const submittingIds = useRef(new Set<number>())
  const drafts = useRef(new Map<number, AssetFormValues>())
  const formAssetId = useRef<number>()
  const [form] = Form.useForm<AssetFormValues>()
  const references = Form.useWatch('input_reference_images', { form, preserve: true }) ?? []
  const tracker = useGenerationTracker(project.id)
  useAnnounceGenerationOutcomes(tracker.tracks)
  const selected = useMemo(() => allAssets.find((item) => item.id === selectedId), [allAssets, selectedId])
  const itemHistory = useMemo(() => history.filter((item) => item.project_asset_id === selected?.id), [history, selected?.id])
  const selectedTrack = selected ? tracker.get(assetImageKey(selected.id)) : undefined
  const generationState = (assetId: number): AssetGenerationState | undefined => {
    if (submissions[assetId]) return submissions[assetId]
    const track = tracker.get(assetImageKey(assetId))
    const latest = history.find((item) => item.project_asset_id === assetId)
    if (track && (!latest || (track.generationId ?? 0) >= latest.id)) return track
    return latest ? { status: latest.status, message: latest.error_msg ?? undefined } : undefined
  }
  const selectedState = selected ? generationState(selected.id) : undefined
  const generating = selectedState?.status === 'submitting' || selectedState?.status === 'pending' || selectedState?.status === 'processing'
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
    if (formAssetId.current === selected?.id) return
    formAssetId.current = selected?.id
    form.resetFields()
    if (selected) form.setFieldsValue(drafts.current.get(selected.id) ?? {
      name: selected.name,
      text_profile: selected.text_profile,
      output_type: selected.output_type,
      output_prompt: selected.output_prompt,
      input_reference_images: selected.input_reference_images,
    })
  }, [form, selected])

  const rememberDraft = () => {
    if (formAssetId.current) drafts.current.set(formAssetId.current, structuredClone(form.getFieldsValue(true)))
  }

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
    const values = structuredClone(form.getFieldsValue(true))
    try {
      await form.validateFields()
      const updated = await workspaceApi.updateAsset(project.id, selected.id, values)
      setAllAssets((items) => items.map((item) => item.id === updated.id ? updated : item))
      if (announce) notifyAppSuccess(message, '资产卡已保存')
    } catch (reason) {
      if (announce && !(reason && typeof reason === 'object' && 'errorFields' in reason)) notifyAppError({ message, modal }, reason)
      throw reason
    }
  }

  const assemblePrompt = async () => {
    if (!selected || assemblingId === selected.id) return
    const assetId = selected.id
    try {
      await form.validateFields(['name', 'output_type'])
      setAssemblingId(assetId)
      const values = structuredClone(form.getFieldsValue(true))
      const result = await workspaceApi.assembleAssetOutputPrompt(project.id, {
        kind: selected.kind,
        name: values.name,
        text_profile: values.text_profile,
        output_type: values.output_type,
      })
      const draft = drafts.current.get(assetId) ?? values
      draft.output_type = result.output_type
      draft.output_prompt = result.output_prompt
      drafts.current.set(assetId, draft)
      if (formAssetId.current === assetId) {
        form.setFieldsValue({ output_type: result.output_type, output_prompt: result.output_prompt })
      }
      notifyAppSuccess(message, '提示词已组装')
    } catch (reason) {
      if (!(reason && typeof reason === 'object' && 'errorFields' in reason)) notifyAppError({ message, modal }, reason)
    } finally {
      setAssemblingId((current) => current === assetId ? undefined : current)
    }
  }

  const generate = async () => {
    if (!selected || generating || submittingIds.current.has(selected.id)) return
    const id = selected.id
    submittingIds.current.add(id)
    try {
      setSubmissions((current) => ({ ...current, [id]: { status: 'submitting' } }))
      await save(false)
      const generation = await workspaceApi.generateAssetImage(project.id, id, {})
      if (!generation.task_id) throw new Error('已提交但未返回任务号，请打开「AI 配置」确认密钥与模型目录后重试')
      tracker.watch({
        key: assetImageKey(selected.id),
        taskId: generation.task_id,
        generationId: generation.id,
        kind: 'image',
        label: selected.name,
        startedAt: generation.created_at,
        status: generation.status === 'processing' ? 'processing' : 'pending',
      })
      setSubmissions((current) => { const next = { ...current }; delete next[id]; return next })
      notifyAppSuccess(message, '已开始生成标准资产图，可随时停止')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'errorFields' in reason) {
        setSubmissions((current) => { const next = { ...current }; delete next[id]; return next })
        return
      }
      setSubmissions((current) => ({ ...current, [id]: { status: 'failed', message: reason instanceof Error ? reason.message : '提交失败' } }))
      notifyAppError({ message, modal }, reason)
    } finally {
      submittingIds.current.delete(id)
    }
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
    if (!selected) return
    const assetId = selected.id
    rememberDraft()
    const uploaded = await uploadsApi.image(file, project.id)
    const draft = drafts.current.get(assetId) ?? {}
    draft.input_reference_images = [...new Set([...(draft.input_reference_images ?? []), uploaded.url])]
    drafts.current.set(assetId, draft)
    if (formAssetId.current === assetId) form.setFieldValue('input_reference_images', draft.input_reference_images)
  }

  const settled = Object.values(tracker.tracks)
    .filter((item) => item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
    .map((item) => `${item.key}:${item.status}:${item.finishedAt ?? ''}`)
    .join('|')
  useEffect(() => {
    if (!settled) return
    const timer = window.setTimeout(() => { void load() }, 350)
    return () => window.clearTimeout(timer)
  }, [load, settled])

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
          <Dropdown menu={{ items: kindItems, onClick: ({ key }) => void create(key as AssetKind) }}>
            <Button type="primary" icon={<PlusOutlined />}>新建资产卡 <DownOutlined /></Button>
          </Dropdown>
        </Space>
      </div>

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
                    <AssetStatusBadge state={generationState(item.id)} hasImage={Boolean(item.image_url)} />
                  </div>
                  <div className="asset-tile-body">
                    <strong>{item.name}</strong>
                    <p>{profileSummary(item.text_profile) || '资料待填写'}</p>
                    <div className="asset-tile-tags"><span>{labels[item.kind]}</span><span>{item.input_reference_images.length} 张输入参考图</span></div>
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
          assembling={assemblingId === selected?.id}
          track={selectedTrack}
          state={selectedState}
          onDraftChange={rememberDraft}
          onSave={() => void save().catch(() => undefined)}
          onRemove={() => void remove()}
          onGenerate={() => void generate()}
          onAssemble={() => void assemblePrompt()}
          onStop={() => selected && void tracker.cancel(assetImageKey(selected.id))}
          onSelectGeneration={(id) => void selectGeneration(id)}
          onUploadStandard={uploadStandard}
          onUploadInputReference={uploadInputReference}
          onReferencesChange={(values) => { form.setFieldValue('input_reference_images', values); rememberDraft() }}
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
  assembling,
  track,
  state,
  onDraftChange,
  onSave,
  onRemove,
  onGenerate,
  onAssemble,
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
  assembling: boolean
  track?: { startedAt: string; finishedAt?: string; status: string; progress?: number; message?: string }
  state?: AssetGenerationState
  onDraftChange: () => void
  onSave: () => void
  onRemove: () => void
  onGenerate: () => void
  onAssemble: () => void
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
      <Form form={form} layout="vertical" className="asset-detail-form" onValuesChange={onDraftChange}>
        <div className="asset-standard-stage">
          {selected.image_url ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.name} /> : <div className="asset-standard-empty"><SafetyCertificateOutlined /><strong>还没有标准资产图</strong></div>}
          <AssetStatusBadge state={state} hasImage={Boolean(selected.image_url)} />
          <div className="asset-standard-status">
            <Tag color={selected.image_url ? 'green' : 'default'}>{selected.image_url ? '标准资产图' : '等待上传或生成'}</Tag>
            <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" customRequest={async ({ file, onSuccess, onError }) => {
              try { await onUploadStandard(file as File); onSuccess?.(file) }
              catch (reason) { onError?.(reason as Error) }
            }}><Button size="small" icon={<CloudUploadOutlined />}>上传标准图</Button></Upload>
          </div>
        </div>
        <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: '请输入资产卡名称' }]}><Input /></Form.Item>
        {profileGroups[selected.kind].map((group) => <section className="asset-profile-group" key={group.title}>
          <div className="asset-panel-heading"><strong>{group.title}</strong></div>
          <div className="asset-profile-grid">{group.fields.map((profileField) => <Form.Item key={profileField.key} name={['text_profile', profileField.key]} label={profileField.label}>
            <Input />
          </Form.Item>)}</div>
        </section>)}
        <section className="asset-output-prompt-panel">
          <div className="asset-panel-heading"><strong>生成提示词</strong></div>
          <div className="asset-output-controls">
            <Form.Item name="output_type" label="预设模板" rules={[{ required: true, message: '请选择预设模板' }]}>
              <Select options={outputTypeOptions[selected.kind]} />
            </Form.Item>
            <Button icon={<BuildOutlined />} loading={assembling} onClick={onAssemble}>组装提示词</Button>
          </div>
          <Form.Item name="output_prompt" label="最终生成提示词">
            <Input.TextArea autoSize={{ minRows: 9, maxRows: 24 }} placeholder="填写标准资产图提示词" />
          </Form.Item>
        </section>
        <section className="asset-generation-panel">
          <div className="asset-panel-heading"><strong>生成标准资产图</strong><RobotOutlined /></div>
          {track ? <GenerationElapsedTime startedAt={track.startedAt} finishedAt={track.finishedAt} active={active} progress={track.progress} message={track.message} /> : null}
          <div className="asset-reference-heading"><span>输入参考图 · {references.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
            try { await onUploadInputReference(file as File); onSuccess?.(file) }
            catch (reason) { onError?.(reason as Error) }
          }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
          <div className="asset-reference-grid">{references.length ? references.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除参考图" onClick={() => onReferencesChange(references.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">暂无输入参考图</span>}</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="primary" block loading={generating} onClick={onGenerate}>{generating ? assetGenerationStatus(state).label : '保存并生成标准图'}</Button>
            {active ? <Button block danger icon={<StopOutlined />} onClick={onStop}>停止生成</Button> : null}
          </Space>
        </section>
        <section className="asset-history-panel">
          <div className="asset-panel-heading"><strong>标准图历史</strong><HistoryOutlined /></div>
          <List size="small" locale={{ emptyText: '还没有生成历史' }} dataSource={history} renderItem={(item) => <List.Item actions={item.status === 'completed' && item.available ? [<Button key="select" size="small" onClick={() => onSelectGeneration(item.id)}>选用这张</Button>] : []}>
            <List.Item.Meta
              avatar={item.image_url ? <Image width={48} height={48} src={mediaUrl(item.image_url)} /> : undefined}
              title={<Space size={5}><Tag>{assetGenerationStatus({ status: item.status, message: item.error_msg ?? undefined }, Boolean(item.image_url)).label}</Tag><span>{item.provider === 'local-upload' ? '本地上传' : (item.provider ?? '未提交')}</span></Space>}
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

function AssetStatusBadge({ state, hasImage }: { state?: AssetGenerationState; hasImage: boolean }) {
  const status = assetGenerationStatus(state, hasImage)
  return <span className={`asset-tile-status is-${status.tone}`} role="status" aria-live="polite" title={state?.message}>{status.label}</span>
}

function field(key: string, label: string): ProfileField {
  return { key, label }
}

function profileSummary(profile: AssetTextProfile): string {
  return Object.values(profile).join(' · ')
}

function parseKindFilter(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}
