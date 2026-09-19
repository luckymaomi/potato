import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  GlobalOutlined,
  HistoryOutlined,
  LockOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons'
import { App, Button, Empty, Form, Image, Input, List, Popconfirm, Select, Space, Tag, Typography, Upload } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mediaHistoryApi, uploadsApi, type MediaGenerationHistory } from '../../api/media'
import { waitForTask } from '../../api/tasks'
import { workspaceApi } from '../../api/workspace'
import type { AssetKind, ProjectAsset } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

const labels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }

export function AssetWorkspace({ kind }: { kind: AssetKind }) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { project, episode } = useProjectWorkspace()
  const [allAssets, setAllAssets] = useState<ProjectAsset[]>([])
  const [history, setHistory] = useState<MediaGenerationHistory[]>([])
  const [selectedId, setSelectedId] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [locking, setLocking] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [references, setReferences] = useState<string[]>([])
  const [form] = Form.useForm<Partial<ProjectAsset>>()
  const items = useMemo(() => allAssets.filter((item) => item.kind === kind), [allAssets, kind])
  const selected = useMemo(() => allAssets.find((item) => item.id === selectedId), [allAssets, selectedId])
  const itemHistory = useMemo(() => history.filter((item) => item.project_asset_id === selected?.id), [history, selected?.id])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [assets, generations] = await Promise.all([
        workspaceApi.assets(project.id),
        mediaHistoryApi.images(project.id),
      ])
      setAllAssets(assets.items)
      setHistory(generations.items)
      setSelectedId((current) => assets.items.some((item) => item.id === current && item.kind === kind)
        ? current
        : assets.items.find((item) => item.kind === kind)?.id)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '资产加载失败')
    } finally {
      setLoading(false)
    }
  }, [kind, message, project.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    form.setFieldsValue(selected ?? {})
  }, [form, selected])
  useEffect(() => {
    setReferences([])
  }, [kind, selected?.id])

  const create = async () => {
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

  const extract = async () => {
    setExtracting(true)
    try {
      const submission = await workspaceApi.extractAssets(project.id, { kind, episode_id: episode.id })
      if (submission.task_id) await waitForTask(submission.task_id)
      await load()
      message.success(`${labels[kind]}提取完成`)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '提取失败')
    } finally {
      setExtracting(false)
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
      message.success('资产图生成完成；历史版本已保留')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '资产图生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const lockCurrent = async () => {
    if (!selected) return
    setLocking(true)
    try {
      await workspaceApi.lockAsset(project.id, selected.id)
      await load()
      message.success('已锁定当前标准图')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '锁定失败')
    } finally {
      setLocking(false)
    }
  }

  const upgrade = async () => {
    if (!selected) return
    setUpgrading(true)
    try {
      await workspaceApi.upgradeAsset(project.id, selected.id)
      await load()
      message.success('已从全局资产更新标准图')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '更新全局版本失败')
    } finally {
      setUpgrading(false)
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
      message.success('已选用并锁定这个版本')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '版本切换失败')
    }
  }

  const generateMissing = async () => {
    setBatchGenerating(true)
    try {
      const result = await workspaceApi.batchGenerateAssets(project.id, { kind })
      if (result.task_id) await waitForTask(result.task_id)
      await load()
      message.success(`已处理 ${result.queued ?? result.submitted ?? 0} 个${labels[kind]}生图任务`)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '批量生图失败')
    } finally {
      setBatchGenerating(false)
    }
  }

  return (
    <div className="workspace-column asset-room">
      <div className="workspace-section-heading asset-room-heading">
        <div><Typography.Title level={2}>{labels[kind]}资产</Typography.Title></div>
        <Space wrap>
          <Button icon={<GlobalOutlined />} onClick={() => navigate(`/film/${project.id}/assets/library?episode_id=${episode.id}&kind=${kind}`)}>从全局库添加</Button>
          <Button icon={<RobotOutlined />} loading={extracting} onClick={() => void extract()}>从剧本提取</Button>
          <Button icon={<ThunderboltOutlined />} loading={batchGenerating} onClick={() => void generateMissing()}>批量生成缺失图</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>新建{labels[kind]}</Button>
        </Space>
      </div>

      <div className="asset-room-grid">
        <aside className="asset-browser" aria-label={`${labels[kind]}资产列表`}>
          <div className="asset-browser-heading"><div><strong>{labels[kind]}标准图</strong><span>{items.length} 项</span></div><Tag>{selected ? '已选中' : '待选择'}</Tag></div>
          {loading && !items.length ? <div className="asset-browser-loading">正在加载</div> : items.length ? (
            <div className="asset-browser-grid">
              {items.map((item) => <button key={item.id} type="button" className={`asset-browser-card${item.id === selectedId ? ' is-active' : ''}`} onClick={() => setSelectedId(item.id)}>
                <div className="asset-browser-image">{item.image_url ? <img src={mediaUrl(item.image_url)} alt={item.name} /> : <span>待生成</span>}</div>
                <div className="asset-browser-copy"><strong>{item.name}</strong><span>{item.locked_image_generation_id ? '已锁定标准图' : '未锁定'}</span></div>
              </button>)}
            </div>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`还没有${labels[kind]}资产`}><Button type="primary" onClick={() => void create()}>加入第一项</Button></Empty>}
          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => void create()}>加入{labels[kind]}</Button>
        </aside>

        <section className="asset-studio">
          {selected ? <Form form={form} layout="vertical">
            <div className="asset-studio-heading">
              <div><span className="asset-studio-kind">{labels[selected.kind]}</span><Typography.Title level={3}>{selected.name}</Typography.Title><Typography.Text type="secondary">标准图与图片描述</Typography.Text></div>
              <Space wrap>
                {selected.library_item_id ? <Button icon={<GlobalOutlined />} loading={upgrading} onClick={() => void upgrade()}>更新全局版本</Button> : null}
                <Button icon={selected.locked_image_generation_id ? <CheckCircleOutlined /> : <LockOutlined />} loading={locking} disabled={!selected.image_url} onClick={() => void lockCurrent()}>{selected.locked_image_generation_id ? '重新锁定' : '锁定标准图'}</Button>
                <Popconfirm title="删除这个资产？" description="分镜中的引用也会移除。" okText="删除" cancelText="取消" onConfirm={() => void remove()}>
                  <Button danger icon={<DeleteOutlined />} loading={deleting}>删除</Button>
                </Popconfirm>
                <Button type="primary" onClick={() => void save()}>保存资产</Button>
              </Space>
            </div>

            <div className="asset-studio-main">
              <div className="asset-standard-stage">
                {selected.image_url ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.name} /> : <div className="asset-standard-empty"><SafetyCertificateOutlined /><strong>还没有标准图</strong><span>可以直接生成，也可以先上传参考图</span></div>}
                <div className="asset-standard-status"><Tag icon={selected.locked_image_generation_id ? <LockOutlined /> : <UnlockOutlined />} color={selected.locked_image_generation_id ? 'green' : 'default'}>{selected.locked_image_generation_id ? '已锁定' : '未锁定'}</Tag><span>{selected.current_image_generation_id ? '有当前版本' : '等待生成'}</span></div>
              </div>

              <div className="asset-studio-fields">
                <Form.Item name="name" label="名称"><Input /></Form.Item>
                <Form.Item name="visual_description" label="图片描述" extra="描述这张标准图里真实呈现的内容。"><Input.TextArea autoSize={{ minRows: 5, maxRows: 9 }} placeholder="例如：短发、深色风衣，站在办公室门口，正面半身。" /></Form.Item>
                <Form.Item name="dependency_asset_ids" label="依赖资产" extra="可不选，也可以选择一个或多个；批量生成会先等待这些标准图就绪。">
                  <Select mode="multiple" allowClear options={allAssets.filter((item) => item.id !== selected.id).map((item) => ({ value: item.id, label: `${labels[item.kind]} · ${item.name}` }))} placeholder="选择依赖资产" />
                </Form.Item>
              </div>
            </div>

            <div className="asset-production-strip">
              <div className="asset-generation-panel">
                <div className="asset-panel-heading"><div><strong>生成新版本</strong><span>提示词和参考图都可留空</span></div><RobotOutlined /></div>
                <Form.Item name="prompt" label="生成提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="可以只写提示词，也可以只上传参考图。" /></Form.Item>
                <div className="asset-reference-heading"><span>参考图 · {references.length} 张</span><Upload showUploadList={false} accept="image/*" multiple customRequest={async ({ file, onSuccess, onError }) => {
                  try {
                    const uploaded = await uploadsApi.image(file as File, project.id)
                    setReferences((current) => [...current, uploaded.url])
                    onSuccess?.(uploaded)
                  } catch (reason) { onError?.(reason as Error) }
                }}><Button size="small" icon={<CloudUploadOutlined />}>添加参考图</Button></Upload></div>
                <div className="asset-reference-grid">
                  {references.length ? references.map((url) => <div className="asset-reference-item" key={url}><Image width={74} height={74} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除参考图" onClick={() => setReferences((current) => current.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">还没有参考图</span>}
                </div>
                <Button type="primary" block loading={generating} onClick={() => void generate()}>{references.length ? '按参考图生成新版本' : '生成新版本'}</Button>
              </div>

              <div className="asset-history-panel">
                <div className="asset-panel-heading"><div><strong>图片历史</strong><span>每次生成都会保留</span></div><HistoryOutlined /></div>
                <List
                  size="small"
                  locale={{ emptyText: '还没有生成历史' }}
                  dataSource={itemHistory}
                  renderItem={(item) => <List.Item actions={item.status === 'completed' && item.available ? [<Button key="select" size="small" icon={<LockOutlined />} onClick={() => void selectVersion(item.id)}>选用并锁定</Button>] : []}>
                    <List.Item.Meta avatar={item.image_url ? <Image width={52} height={52} src={mediaUrl(item.image_url)} /> : undefined} title={<Space size={5}><Tag>{item.status}</Tag><span>{item.provider ?? '未提交'}</span></Space>} description={item.status === 'failed' ? item.error_msg : item.prompt || '无提示词'} />
                  </List.Item>}
                />
              </div>
            </div>
          </Form> : <Empty className="workspace-empty" description={`选择一个${labels[kind]}资产`} />}
        </section>
      </div>
    </div>
  )
}
