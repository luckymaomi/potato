import { ArrowLeftOutlined, CheckOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Empty, Form, Image, Input, Modal, Select, Space, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { workspaceApi } from '../../api/workspace'
import type { AssetKind, AssetLibraryItem } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { useProjectWorkspace } from './workspaceContext'

const labels: Record<AssetKind, string> = { character: '人物', scene: '场景', prop: '道具' }

export function AssetLibraryWorkspace() {
  const { message } = App.useApp()
  const { project, episode } = useProjectWorkspace()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = parseKind(searchParams.get('kind'))
  const [items, setItems] = useState<AssetLibraryItem[]>([])
  const [adding, setAdding] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm<Partial<AssetLibraryItem>>()

  const load = useCallback(async () => {
    try { setItems((await workspaceApi.library(kind)).items) }
    catch (reason) { message.error(reason instanceof Error ? reason.message : '全局资产库加载失败') }
  }, [kind, message])
  useEffect(() => { void load() }, [load])

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
      await workspaceApi.createLibraryItem({ kind, ...form.getFieldsValue() })
      setCreating(false)
      form.resetFields()
      await load()
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '创建全局资产失败')
    }
  }

  return (
    <div className="workspace-column">
      <div className="workspace-section-heading">
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/film/${project.id}/${kind === 'character' ? 'characters' : kind === 'scene' ? 'scenes' : 'props'}?episode_id=${episode.id}`)}>返回{labels[kind]}</Button>
          <Typography.Title level={2}>全局资产库</Typography.Title>
        </div>
        <Space><Select value={kind} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} onChange={(value) => setSearchParams({ episode_id: String(episode.id), kind: value })} /><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建全局资产</Button></Space>
      </div>
      {items.length ? <div className="asset-grid">{items.map((item) => (
        <Card key={item.id} className="asset-card" cover={item.image_url ? <Image preview={false} src={mediaUrl(item.image_url)} alt={item.name} /> : <div className="asset-placeholder">暂无标准图</div>} actions={[<Button key="add" type="link" icon={<CheckOutlined />} loading={adding.includes(item.id)} onClick={() => void add(item)}>加入当前项目</Button>]}>
          <Card.Meta title={item.name} description={item.visual_description || '还没有图片描述'} />
        </Card>
      ))}</div> : <Empty className="workspace-empty" description={`全局库里还没有${labels[kind]}`} />}
      <Modal title="新建全局资产" open={creating} onCancel={() => setCreating(false)} onOk={() => void create()} okText="创建">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称"><Input placeholder={`未命名${labels[kind]}`} /></Form.Item>
          <Form.Item name="visual_description" label="图片描述"><Input.TextArea placeholder="可稍后在选定标准图后填写" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function parseKind(value: string | null): AssetKind {
  return value === 'scene' || value === 'prop' ? value : 'character'
}
