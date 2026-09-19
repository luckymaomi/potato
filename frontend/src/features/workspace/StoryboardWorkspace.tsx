import {
  CheckOutlined,
  DeleteOutlined,
  LeftOutlined,
  PlusOutlined,
  RobotOutlined,
  RightOutlined,
  SaveOutlined,
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
  Space,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waitForTask } from '../../api/tasks'
import { workspaceApi } from '../../api/workspace'
import type { AssetKind, ProjectAsset, Storyboard } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

interface StoryboardFormValues extends Partial<Storyboard> {
  character_asset_ids?: number[]
  scene_asset_ids?: number[]
  prop_asset_ids?: number[]
}

const assetLabels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }

export function StoryboardWorkspace() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { project, episode } = useProjectWorkspace()
  const [items, setItems] = useState<Storyboard[]>([])
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [selectedId, setSelectedId] = useState<number>()
  const [saving, setSaving] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [form] = Form.useForm<StoryboardFormValues>()
  const gridRows = Form.useWatch('grid_rows', form) ?? 1
  const gridColumns = Form.useWatch('grid_columns', form) ?? 1
  const characterAssetIds = Form.useWatch('character_asset_ids', { form, preserve: true }) ?? []
  const sceneAssetIds = Form.useWatch('scene_asset_ids', { form, preserve: true }) ?? []
  const propAssetIds = Form.useWatch('prop_asset_ids', { form, preserve: true }) ?? []
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId])
  const selectedIndex = selected ? items.findIndex((item) => item.id === selected.id) : -1

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
      message.error(reason instanceof Error ? reason.message : '分镜台加载失败')
    }
  }, [episode.id, message, project.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    form.setFieldsValue(selected ? {
      ...selected,
      character_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'character'),
      scene_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'scene'),
      prop_asset_ids: filterAssetIds(selected.project_asset_ids, assets, 'prop'),
    } : {})
  }, [assets, form, selected])

  const create = async () => {
    try {
      const created = await workspaceApi.createStoryboard(project.id, { episode_id: episode.id })
      await load()
      setSelectedId(created.id)
      message.success('已加入镜头')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '新建分镜失败')
    }
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const values = form.getFieldsValue(true)
      const { character_asset_ids, scene_asset_ids, prop_asset_ids, ...fields } = values
      await workspaceApi.updateStoryboard(project.id, selected.id, {
        ...fields,
        project_asset_ids: [...(character_asset_ids ?? []), ...(scene_asset_ids ?? []), ...(prop_asset_ids ?? [])],
      })
      await load()
      message.success('镜头已保存')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '分镜保存失败')
    } finally {
      setSaving(false)
    }
  }

  const split = async () => {
    setSplitting(true)
    try {
      const submission = await workspaceApi.splitStoryboards(project.id, { episode_id: episode.id, storyboard_count: 10 })
      if (submission.task_id) await waitForTask(submission.task_id)
      await load()
      message.success('AI 拆镜完成')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 拆镜失败')
    } finally {
      setSplitting(false)
    }
  }

  const remove = async () => {
    if (!selected) return
    try {
      await workspaceApi.removeStoryboard(project.id, selected.id)
      await load()
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '删除分镜失败')
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
          <div className="director-progress-summary"><strong>{items.length}</strong><span>镜头</span><i /><strong>{items.filter((item) => item.image_url).length}</strong><span>已出图</span></div>
          <Button icon={<RobotOutlined />} loading={splitting} onClick={() => void split()}>AI 拆镜</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>加入镜头</Button>
        </Space>
      </div>

      <div className="director-command-strip">
        <div className="director-command-copy"><strong>{episode.episode_number}. {episode.title}</strong><span>{items.length} 个镜头</span></div>
        <Button type="link" onClick={() => navigate(`/film/${project.id}/produce?episode_id=${episode.id}`)}>去生产房间 <RightOutlined /></Button>
      </div>

      {!items.length ? (
        <Empty className="workspace-empty director-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有镜头">
          <Space direction="vertical" align="center"><Typography.Text type="secondary">可用 AI 拆镜，或直接加入第一镜。</Typography.Text><Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>加入第一镜</Button></Space>
        </Empty>
      ) : (
        <div className="director-workbench">
          <aside className="director-shot-strip" aria-label="镜头带">
            <div className="director-rail-header"><div><strong>镜头带</strong><span>按顺序</span></div><Tag>{items.length}</Tag></div>
            <div className="director-shot-list">{items.map((item) => <ShotCard key={item.id} item={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />)}</div>
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => void create()}>加入镜头</Button>
          </aside>

          <div className="director-workbench-main">
            <main className="director-stage">
              {selected ? <>
                <div className="director-stage-toolbar">
                  <div><span className="stage-index">镜头 {String(selected.storyboard_number).padStart(2, '0')}</span><strong>{selected.title || '未命名镜头'}</strong><span className="stage-muted">{selected.shot_size || '景别待定'}</span></div>
                  <Space size={4}><Button type="text" icon={<LeftOutlined />} disabled={selectedIndex <= 0} onClick={() => selectRelative(-1)} /><Button type="text" icon={<RightOutlined />} disabled={selectedIndex < 0 || selectedIndex >= items.length - 1} onClick={() => selectRelative(1)} /></Space>
                </div>
                <div className="director-frame-wrap">
                  {selected.image_url ? <Image preview src={mediaUrl(selected.image_url)} alt={selected.title || '分镜图'} className="director-frame-image" /> : <div className="director-frame-empty"><div className="frame-placeholder-icon">{String(selected.storyboard_number).padStart(2, '0')}</div><strong>这一镜还没有分镜图</strong><span>在生产房间单独生成这一镜</span><Button onClick={() => navigate(`/film/${project.id}/produce?episode_id=${episode.id}`)}>打开生产房间</Button></div>}
                  <div className="director-frame-meta"><span>{selected.composition || '尚未填写构图'}</span><span>{selected.grid_rows ?? 1}×{selected.grid_columns ?? 1} 网格提示</span></div>
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
                        {selectedIds.includes(asset.id) ? <CheckOutlined /> : null}
                      </button>) : <em>暂无{assetLabels[kind]}资产</em>}</div>
                    </section>
                  })}
                </div>
              </> : <Empty description="选择一镜" />}
            </main>

            <aside className="director-inspector">
              {selected ? <Form form={form} layout="vertical" className="director-form">
                <div className="director-inspector-heading"><div><span>镜头设置</span><strong>镜头 {selected.storyboard_number}</strong></div><Tag color={imageReady ? 'green' : 'default'}>{imageReady ? '已有分镜图' : '待出图'}</Tag></div>
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
                  <Form.Item label="镜头时长"><Typography.Text type="secondary">由视频模型能力决定，生成时会使用模型支持的时长。</Typography.Text></Form.Item>
                </Collapse.Panel>
                <Collapse.Panel key="generation" header="生成输入">
                  <Typography.Paragraph type="secondary" className="director-help-copy">这些内容可留空。</Typography.Paragraph>
                  <Form.Item name="image_prompt" label="图像提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可选" /></Form.Item>
                  <Form.Item name="negative_prompt" label="负面提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="可选" /></Form.Item>
                  <Form.Item name="video_prompt" label="视频提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可选" /></Form.Item>
                  <Form.Item label="分镜图网格提示"><GridPicker rows={gridRows} columns={gridColumns} onChange={(rows, columns) => form.setFieldsValue({ grid_rows: rows, grid_columns: columns })} /></Form.Item>
                </Collapse.Panel>
                </Collapse>
                <div className="director-inspector-footer"><Space><Popconfirm title="删除这个镜头？" onConfirm={() => void remove()}><Button danger icon={<DeleteOutlined />} /></Popconfirm><Button icon={<SaveOutlined />} type="primary" loading={saving} onClick={() => void save()}>保存</Button></Space><span>{videoReady ? '视频已生成' : '视频未生成'}</span></div>
              </Form> : <Empty description="选择镜头后编辑" />}
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}

function ShotCard({ item, active, onClick }: { item: Storyboard; active: boolean; onClick: () => void }) {
  return <button type="button" className={`director-shot-card${active ? ' is-active' : ''}`} onClick={onClick}>
    <div className="director-shot-thumb">{item.image_url ? <img src={mediaUrl(item.image_url)} alt="" /> : <span>{String(item.storyboard_number).padStart(2, '0')}</span>}<div className="shot-status-dots"><i className={item.image_url ? 'is-ready' : ''} /><i className={item.video_url ? 'is-ready is-video' : ''} /></div></div>
    <div className="director-shot-copy"><div><strong>{String(item.storyboard_number).padStart(2, '0')}</strong><span>{item.title || '未命名镜头'}</span></div><small>{item.shot_size || '景别待定'}</small>{item.dialogue && <em>“{item.dialogue}”</em>}</div>
  </button>
}

function GridPicker({ rows, columns, onChange }: { rows: number; columns: number; onChange: (rows: number, columns: number) => void }) {
  const presets = [{ label: '单画面', rows: 1, columns: 1 }, { label: '六宫格', rows: 2, columns: 3 }, { label: '九宫格', rows: 3, columns: 3 }, { label: '十六宫格', rows: 4, columns: 4 }]
  return <div className="grid-picker"><Space wrap>{presets.map((item) => <Button size="small" key={item.label} type={rows === item.rows && columns === item.columns ? 'primary' : 'default'} onClick={() => onChange(item.rows, item.columns)}>{item.label}</Button>)}</Space><div className="custom-grid" aria-label="自定义网格">{Array.from({ length: 64 }, (_, index) => { const row = Math.floor(index / 8) + 1; const column = index % 8 + 1; return <button type="button" key={index} className={row <= rows && column <= columns ? 'is-selected' : ''} title={`${row}×${column}`} onPointerEnter={(event) => { if (event.buttons === 1) onChange(row, column) }} onPointerDown={() => onChange(row, column)} /> })}</div><Typography.Text type="secondary">当前 {rows}×{columns}。只改变提示词，不切图。</Typography.Text></div>
}

function filterAssetIds(value: number[] | undefined, assets: ProjectAsset[], kind: AssetKind): number[] {
  const allowed = new Set(assets.filter((item) => item.kind === kind).map((item) => item.id))
  return (value ?? []).filter((id) => allowed.has(id))
}
