import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  HistoryOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { App, Button, Dropdown, Empty, Form, Image, Input, List, Popconfirm, Select, Space, Spin, Tag, Typography, Upload, type FormInstance } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mediaHistoryApi, uploadsApi, type MediaGenerationHistory } from '../../api/media'
import { waitForTask } from '../../api/tasks'
import { workspaceApi } from '../../api/workspace'
import type { AssetKind, ProjectAsset } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

type AssetFilter = 'all' | AssetKind

const labels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }
const untaggedFilter = '__untagged__'

export function AssetWorkspace() {
  const { message } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [allAssets, setAllAssets] = useState<ProjectAsset[]>([])
  const [history, setHistory] = useState<MediaGenerationHistory[]>([])
  const [selectedId, setSelectedId] = useState<number>()
  const [activeKind, setActiveKind] = useState<AssetFilter>(() => parseKindFilter(searchParams.get('kind')))
  const [activeTag, setActiveTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState<AssetKind>()
  const [generating, setGenerating] = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [references, setReferences] = useState<string[]>([])
  const [form] = Form.useForm<Partial<ProjectAsset>>()
  const selected = useMemo(() => allAssets.find((item) => item.id === selectedId), [allAssets, selectedId])
  const itemHistory = useMemo(() => history.filter((item) => item.project_asset_id === selected?.id), [history, selected?.id])
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
      message.error(reason instanceof Error ? reason.message : '资产加载失败')
    } finally {
      setLoading(false)
    }
  }, [message, project.id])

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
      message.success(`已加入${labels[kind]}资产`)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '创建失败')
    }
  }

  const save = async (announce = true) => {
    if (!selected) return
    try {
      await workspaceApi.updateAsset(project.id, selected.id, form.getFieldsValue())
      await load()
      if (announce) message.success('资产已保存')
    } catch (reason) {
      if (announce) message.error(reason instanceof Error ? reason.message : '保存失败')
      throw reason
    }
  }

  const extract = async (kind: AssetKind) => {
    setExtracting(kind)
    try {
      const submission = await workspaceApi.extractAssets(project.id, { kind, episode_id: episode.id })
      if (submission.task_id) await waitForTask(submission.task_id)
      await load()
      changeKind(kind)
      message.success(`${labels[kind]}提取完成`)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '提取失败')
    } finally {
      setExtracting(undefined)
    }
  }

  const generate = async () => {
    if (!selected) return
    setGenerating(true)
    try {
      await save(false)
      const values = form.getFieldsValue()
      const generation = await workspaceApi.generateAssetImage(project.id, selected.id, {
        prompt: values.prompt ?? '',
        reference_images: references,
      })
      if (generation.task_id) await waitForTask(generation.task_id)
      await load()
      message.success('资产图生成完成；历史图片已保留')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '资产图生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const remove = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await workspaceApi.removeAsset(project.id, selected.id)
      setSelectedId(undefined)
      await load()
      message.success('资产已删除')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const selectVersion = async (generationId: number) => {
    if (!selected) return
    try {
      await mediaHistoryApi.selectImage(generationId)
      await load()
      message.success('已选用这张图片')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '版本切换失败')
    }
  }

  const generateMissing = async () => {
    setBatchGenerating(true)
    try {
      const result = await workspaceApi.batchGenerateAssets(project.id, { kind: activeKind === 'all' ? undefined : activeKind })
      if (result.task_id) await waitForTask(result.task_id)
      await load()
      message.success(`已处理 ${result.queued ?? result.submitted ?? 0} 个资产图任务`)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '批量生图失败')
    } finally {
      setBatchGenerating(false)
    }
  }

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
          <Dropdown menu={{ items: kindItems, onClick: ({ key }) => void extract(key as AssetKind) }}>
            <Button icon={<RobotOutlined />} loading={Boolean(extracting)}>从剧本提取 <DownOutlined /></Button>
          </Dropdown>
          <Button icon={<ThunderboltOutlined />} loading={batchGenerating} onClick={() => void generateMissing()}>批量生成缺失图</Button>
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
          onSave={() => void save()}
          onRemove={() => void remove()}
          onGenerate={() => void generate()}
          onSelectVersion={(id) => void selectVersion(id)}
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
  onSave,
  onRemove,
  onGenerate,
  onSelectVersion,
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
  onSave: () => void
  onRemove: () => void
  onGenerate: () => void
  onSelectVersion: (id: number) => void
  onReferencesChange: (values: string[]) => void
}) {
  if (!selected) return <aside className="asset-detail-panel asset-detail-panel-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一张资产图查看详情" /></aside>
  return <aside className="asset-detail-panel">
    <div className="asset-detail-header"><div><span>当前资产</span><strong>{selected.name}</strong></div><Button type="primary" onClick={onSave}>保存</Button></div>
    <div className="asset-detail-scroll">
      <Form form={form} layout="vertical" className="asset-detail-form">
        <div className="asset-standard-stage">
          {selected.image_url ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.name} /> : <div className="asset-standard-empty"><SafetyCertificateOutlined /><strong>还没有标准图</strong><span>可以直接生成，也可以先上传参考图</span></div>}
          <div className="asset-standard-status"><Tag color={selected.image_url ? 'green' : 'default'}>{selected.image_url ? '标准图' : '等待生成'}</Tag></div>
        </div>
        <Form.Item name="name" label="名称"><Input /></Form.Item>
        <Form.Item name="visual_description" label="图片描述"><Input.TextArea autoSize={{ minRows: 5, maxRows: 9 }} placeholder="描述标准图中真实呈现的内容。" /></Form.Item>
        <Form.Item name="tags" label="分类标签"><Select mode="tags" allowClear tokenSeparators={[',', '，']} options={allTags.map((tag) => ({ value: tag, label: tag }))} placeholder="输入标签后回车，可添加多个" /></Form.Item>
        <section className="asset-generation-panel">
          <div className="asset-panel-heading"><strong>生成图片</strong><RobotOutlined /></div>
          <Form.Item name="prompt" label="生成提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="可只写提示词，也可以只上传参考图。" /></Form.Item>
          <div className="asset-reference-heading"><span>参考图 · {references.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
            try {
              const uploaded = await uploadsApi.image(file as File, projectId)
              onReferencesChange([...references, uploaded.url])
              onSuccess?.(uploaded)
            } catch (reason) { onError?.(reason as Error) }
          }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
          <div className="asset-reference-grid">{references.length ? references.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除参考图" onClick={() => onReferencesChange(references.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">还没有参考图</span>}</div>
          <Button type="primary" block loading={generating} onClick={onGenerate}>{references.length ? '按参考图生成' : '生成图片'}</Button>
        </section>
        <section className="asset-history-panel">
          <div className="asset-panel-heading"><strong>图片历史</strong><HistoryOutlined /></div>
          <List size="small" locale={{ emptyText: '还没有生成历史' }} dataSource={history} renderItem={(item) => <List.Item actions={item.status === 'completed' && item.available ? [<Button key="select" size="small" onClick={() => onSelectVersion(item.id)}>选用这张</Button>] : []}><List.Item.Meta avatar={item.image_url ? <Image width={48} height={48} src={mediaUrl(item.image_url)} /> : undefined} title={<Space size={5}><Tag>{item.status}</Tag><span>{item.provider ?? '未提交'}</span></Space>} description={item.status === 'failed' ? item.error_msg : item.prompt || '无提示词'} /></List.Item>} />
        </section>
        <Popconfirm title="删除这个资产？" description="分镜中的引用也会移除。" okText="删除" cancelText="取消" onConfirm={onRemove}><Button danger icon={<DeleteOutlined />} loading={deleting}>删除资产</Button></Popconfirm>
      </Form>
    </div>
  </aside>
}

function parseKindFilter(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}
