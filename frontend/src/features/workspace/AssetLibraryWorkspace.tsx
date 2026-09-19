import { CheckOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Empty, Form, Image, Input, Modal, Select, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { workspaceApi } from '../../api/workspace'
import type { AssetKind, AssetLibraryItem } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

type AssetFilter = 'all' | AssetKind

const labels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }

export function AssetLibraryWorkspace() {
  const { message } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [kind, setKind] = useState<AssetFilter>(() => parseKind(searchParams.get('kind')))
  const [items, setItems] = useState<AssetLibraryItem[]>([])
  const [adding, setAdding] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm<Partial<AssetLibraryItem>>()
  const allTags = useMemo(() => [...new Set(items.flatMap((item) => item.tags ?? []))].sort((left, right) => left.localeCompare(right, 'zh-CN')), [items])

  const load = useCallback(async () => {
    try { setItems((await workspaceApi.library(kind === 'all' ? undefined : kind)).items) }
    catch (reason) { message.error(reason instanceof Error ? reason.message : '全局资产库加载失败') }
  }, [kind, message])
  useEffect(() => { void load() }, [load])

  const changeKind = (value: AssetFilter) => {
    setKind(value)
    setSearchParams(value === 'all' ? { episode_id: String(episode.id) } : { episode_id: String(episode.id), kind: value })
  }

  const add = async (item: AssetLibraryItem) => {
    setAdding((current) => [...current, item.id])
    try {
      await workspaceApi.createAsset(project.id, { from_library_item_id: item.id })
      message.success(`已把“${item.name}”以当前版本加入项目`)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '加入项目失败')
    } finally {
      setAdding((current) => current.filter((id) => id !== item.id))
    }
  }

  const create = async () => {
    try {
      const values = form.getFieldsValue()
      await workspaceApi.createLibraryItem({ ...values, kind: values.kind ?? (kind === 'all' ? 'character' : kind) })
      setCreating(false)
      form.resetFields()
      await load()
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '创建全局资产失败')
    }
  }

  const typeOptions = [
    { value: 'all', label: '全部' },
    ...Object.entries(labels).map(([value, label]) => ({ value, label })),
  ]

  return (
    <div className="workspace-column asset-gallery-room">
      <div className="workspace-section-heading">
        <Typography.Title level={2}>资产图</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建全局资产</Button>
      </div>
      <div className="asset-panel-layout asset-library-layout">
        <div className="asset-panel-content">
          <div className="asset-gallery-toolbar">
            <div className="asset-kind-filters" aria-label="资产类型">
              {typeOptions.map((option) => <button type="button" key={String(option.value)} className={kind === option.value ? 'is-active' : ''} aria-pressed={kind === option.value} onClick={() => changeKind(option.value as AssetFilter)}>{option.label}</button>)}
            </div>
            <span>{items.length} 张全局资产图</span>
          </div>
          <div className="asset-gallery-scroll">
            {items.length ? <div className="asset-library-grid">{items.map((item) => (
          <Card key={item.id} className="asset-card" cover={item.image_url ? <Image preview={false} src={mediaUrl(item.image_url)} alt={item.name} /> : <div className="asset-placeholder">暂无标准图</div>} actions={[<Button key="add" type="link" icon={<CheckOutlined />} loading={adding.includes(item.id)} onClick={() => void add(item)}>加入当前项目</Button>]}>
            <div className="asset-library-card-head"><strong>{item.name}</strong><Tag>{labels[item.kind]}</Tag></div>
            <p>{item.visual_description || '还没有图片描述'}</p>
            <div className="asset-tile-tags">{item.tags?.length ? item.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>未分类</span>}</div>
          </Card>
            ))}</div> : <Empty className="workspace-empty" description="全局资产库为空" />}
          </div>
        </div>
      </div>
      <Modal title="新建全局资产" open={creating} onCancel={() => setCreating(false)} onOk={() => void create()} okText="创建">
        <Form form={form} layout="vertical">
          <Form.Item name="kind" label="类型" initialValue={kind === 'all' ? 'character' : kind}><Select options={Object.entries(labels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="name" label="名称"><Input placeholder="资产名称" /></Form.Item>
          <Form.Item name="visual_description" label="图片描述"><Input.TextArea placeholder="可稍后在选定标准图后填写" /></Form.Item>
          <Form.Item name="tags" label="分类标签"><Select mode="tags" allowClear tokenSeparators={[',', '，']} options={allTags.map((tag) => ({ value: tag, label: tag }))} placeholder="输入标签后回车，可添加多个" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function parseKind(value: string | null): AssetFilter {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : 'all'
}
