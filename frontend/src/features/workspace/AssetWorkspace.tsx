import {
  DownOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { App, Button, Dropdown, Empty, Form, Space, Spin, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mediaHistoryApi, uploadsApi, type MediaGenerationHistory } from '../../api/media'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import type { AssetKind, ProjectAsset } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useAnnounceGenerationOutcomes } from '../generation/useAnnounceGenerationOutcomes'
import { assetImageKey, useGenerationTracker } from '../generation/useGenerationTracker'
import { useProjectWorkspace } from './workspaceContext'
import { assetLabels, parseKindFilter, profileSummary, type AssetFilter, type AssetFormValues } from './assetWorkspaceConfig'
import { AssetDetailPanel, AssetStatusBadge } from './AssetDetailPanel'
import type { AssetGenerationState } from './assetGenerationStatus'

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
      const created = await workspaceApi.createAsset(project.id, { kind, name: `未命名${assetLabels[kind]}` })
      await load()
      setSelectedId(created.id)
      notifyAppSuccess(message, `已新建${assetLabels[kind]}`)
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

  const kindItems = Object.entries(assetLabels).map(([key, label]) => ({ key, label }))
  const typeOptions = [
    { value: 'all', label: `全部 ${allAssets.length}` },
    ...Object.entries(assetLabels).map(([value, label]) => ({ value, label: `${label} ${allAssets.filter((item) => item.kind === value).length}` })),
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
                    <div className="asset-tile-tags"><span>{assetLabels[item.kind]}</span><span>{item.input_reference_images.length} 张输入参考图</span></div>
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
