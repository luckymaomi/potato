import {
  BranchesOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Divider, Empty, Form, Input, InputNumber, message, Popconfirm, Select, Space, Tag, Tooltip, Typography, Upload } from 'antd'
import { useEffect, useState } from 'react'
import { aiConfigsApi } from '../../api/aiConfigs'
import { uploadsApi } from '../../api/media'
import type { ProviderCatalogStatus, ProviderModel } from '../../types/domain'
import { useWorkbenchStore, type CanvasNodeData, type CanvasNodeKind, type MediaMode, type TextMode } from '../../store/workbenchStore'
import { nodeServiceType, supportsService } from '../providers/catalog'

const kindOptions: Array<{ value: CanvasNodeKind; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'character', label: '角色图片' },
  { value: 'scene', label: '场景图片' },
  { value: 'prop', label: '道具图片' },
  { value: 'storyboard', label: '分镜' },
]

const statusLabels: Record<string, string> = {
  idle: '未运行', pending: '排队中', processing: '运行中', completed: '已完成', failed: '失败',
}

interface CanvasInspectorProps {
  running: boolean
  onRunNode: (nodeId: string) => Promise<void>
  onRunDownstream: (nodeId: string) => Promise<void>
}

export function CanvasInspector({ running, onRunNode, onRunDownstream }: CanvasInspectorProps) {
  const node = useWorkbenchStore((state) => state.nodes.find((item) => item.id === state.selectedNodeId) || null)
  const project = useWorkbenchStore((state) => state.project)
  const updateNodeData = useWorkbenchStore((state) => state.updateNodeData)
  const duplicateNodes = useWorkbenchStore((state) => state.duplicateNodes)
  const removeNode = useWorkbenchStore((state) => state.removeNode)
  const saveWorkspace = useWorkbenchStore((state) => state.save)
  const [uploading, setUploading] = useState(false)
  const [providers, setProviders] = useState<ProviderCatalogStatus[]>([])
  const [models, setModels] = useState<ProviderModel[]>([])
  const [form] = Form.useForm<CanvasNodeData>()
  const preset = Form.useWatch('preset', form) || node?.data.preset
  const mode = Form.useWatch('mode', form)
  const provider = Form.useWatch('provider', form)
  const serviceType = nodeServiceType(preset, mode)

  useEffect(() => {
    if (node) form.setFieldsValue(node.data)
    else form.resetFields()
  }, [form, node])

  useEffect(() => {
    if (!serviceType) return
    let active = true
    void Promise.all([aiConfigsApi.providers(), aiConfigsApi.models({ service_type: serviceType })])
      .then(([providerItems, modelItems]) => {
        if (!active) return
        setProviders(providerItems.filter((item) => item.enabled && item.configured && supportsService(item.capabilities, serviceType)))
        setModels(modelItems)
      })
      .catch(() => {
        if (!active) return
        setProviders([])
        setModels([])
      })
    return () => { active = false }
  }, [serviceType])

  if (!node) {
    return (
      <aside className="canvas-inspector canvas-inspector-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个节点进行编辑" />
      </aside>
    )
  }

  const applyFields = async () => {
    const values = await form.validateFields()
    updateNodeData(node.id, values)
    return values
  }

  const save = async () => {
    await applyFields()
    await saveWorkspace()
    message.success('节点和画布已保存')
  }

  const run = async (scope: 'node' | 'downstream') => {
    await applyFields()
    if (scope === 'node') await onRunNode(node.id)
    else await onRunDownstream(node.id)
  }

  const uploadReference = async (file: File) => {
    if (!project) return false
    setUploading(true)
    try {
      const uploaded = await uploadsApi.image(file, project.id)
      const current = form.getFieldValue('referenceImages') || []
      const next = [...new Set([...current, uploaded.url].filter(Boolean))]
      form.setFieldValue('referenceImages', next)
      updateNodeData(node.id, { referenceImages: next })
      message.success('参考图已上传')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setUploading(false)
    }
    return false
  }

  const mediaModeOptions: Array<{ value: MediaMode; label: string }> = preset === 'video'
    ? [{ value: 'text-to-video', label: '文生视频' }, { value: 'image-to-video', label: '图生视频' }]
    : preset === 'storyboard'
      ? [
          { value: 'storyboard', label: '从剧本拆分分镜' },
          { value: 'text-to-image', label: '文生分镜图' },
          { value: 'image-to-image', label: '图生分镜图' },
          { value: 'text-to-video', label: '文生分镜视频' },
          { value: 'image-to-video', label: '图生分镜视频' },
        ]
      : [{ value: 'text-to-image', label: '文生图' }, { value: 'image-to-image', label: '图生图' }]
  const needsReferences = mode === 'image-to-image' || mode === 'image-to-video'
  const providerOptions = providers.map((item) => ({ value: item.id, label: item.label }))
  const availableModels = models.filter((item) => !provider || item.provider === provider)
  const modelOptions = availableModels.map((item) => ({
    value: item.id,
    label: provider ? item.label : `${providers.find((entry) => entry.id === item.provider)?.label || item.provider} · ${item.label}`,
  }))

  return (
    <aside className="canvas-inspector">
      <div className="inspector-heading">
        <div>
          <Typography.Text type="secondary">节点编辑</Typography.Text>
          <h2>{node.data.title || node.data.label}</h2>
        </div>
        <Space size={2}>
          <Tooltip title="复制节点"><Button type="text" icon={<CopyOutlined />} aria-label="复制节点" onClick={() => duplicateNodes([node.id])} /></Tooltip>
          <Popconfirm
            title="删除节点"
            description="相连的连线也会一并删除。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeNode(node.id)}
          >
            <Tooltip title="删除节点"><Button type="text" danger icon={<DeleteOutlined />} aria-label="删除节点" /></Tooltip>
          </Popconfirm>
        </Space>
      </div>

      <div className="inspector-status-row">
        <Tag>{statusLabels[node.data.status || 'idle']}</Tag>
        {node.data.taskId && <Typography.Text type="secondary" ellipsis>任务 {node.data.taskId}</Typography.Text>}
      </div>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onValuesChange={(_, values) => updateNodeData(node.id, values)}
      >
        <Form.Item name="title" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item name="preset" label="节点类型"><Select options={kindOptions} /></Form.Item>

        <Divider>内容与生成</Divider>
        {preset === 'text' ? (
          <>
            <Form.Item name="mode" label="内容方式">
              <Select options={[
                { value: 'manual', label: '手动编辑' },
                { value: 'ai', label: '使用文本 API' } satisfies { value: TextMode; label: string },
              ]} />
            </Form.Item>
            {mode === 'ai' && (
              <>
                <Form.Item name="apiAction" label="AI 动作">
                  <Select options={[
                    { value: 'story', label: '生成故事或剧本' },
                    { value: 'characters', label: '从剧本提取角色' },
                    { value: 'scenes', label: '从剧本提取场景' },
                    { value: 'props', label: '从剧本提取道具' },
                  ]} />
                </Form.Item>
                <ProviderModelFields
                  providerOptions={providerOptions}
                  modelOptions={modelOptions}
                  onProviderChange={() => form.setFieldValue('model', undefined)}
                />
              </>
            )}
            <Form.Item name="episodeId" label="关联剧集">
              <Select
                allowClear
                options={(project?.episodes || []).map((episode) => ({
                  value: episode.id,
                  label: episode.title || `第 ${episode.episode_number} 集`,
                }))}
              />
            </Form.Item>
            <Form.Item name="text" label="文本内容">
              <Input.TextArea rows={12} placeholder="输入剧本、提示词或提取内容" />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item name="mode" label="运行方式"><Select options={mediaModeOptions} /></Form.Item>
            {!(preset === 'storyboard' && mode === 'storyboard') && (
              <Form.Item name="prompt" label="提示词">
                <Input.TextArea rows={7} placeholder="描述主体、环境、动作、风格和镜头" />
              </Form.Item>
            )}
            {preset === 'storyboard' && (
              <Form.Item name="episodeId" label="关联剧集">
                <Select
                  allowClear
                  options={(project?.episodes || []).map((episode) => ({ value: episode.id, label: episode.title }))}
                />
              </Form.Item>
            )}
            {needsReferences && (
              <>
                <Form.Item name="referenceImages" label="参考图">
                  <Select mode="tags" tokenSeparators={[',']} placeholder="粘贴图片 URL 后回车" />
                </Form.Item>
                <Form.Item>
                  <Upload accept="image/jpeg,image/png,image/gif,image/webp" multiple showUploadList={false} beforeUpload={uploadReference}>
                    <Button icon={<UploadOutlined />} loading={uploading}>上传本地图片</Button>
                  </Upload>
                </Form.Item>
              </>
            )}
            <Space align="start" className="inspector-inline-fields">
              <Form.Item name="provider" label="供应商">
                <Select allowClear options={providerOptions} placeholder="自动选择" onChange={() => form.setFieldValue('model', undefined)} />
              </Form.Item>
              <Form.Item name="model" label="模型">
                <Select allowClear showSearch optionFilterProp="label" options={modelOptions} placeholder="自动选择" />
              </Form.Item>
              {(mode === 'text-to-video' || mode === 'image-to-video') && (
                <Form.Item name="duration" label="时长（秒）"><InputNumber min={1} max={60} /></Form.Item>
              )}
            </Space>
            {node.data.mediaUrl && <Typography.Link href={String(node.data.mediaUrl)} target="_blank">打开生成结果</Typography.Link>}
          </>
        )}
      </Form>

      {node.data.status === 'failed' && <div className="node-error-message">{node.data.error || '运行失败，请检查配置后重试。'}</div>}

      <div className="inspector-actions">
        <Button icon={<SaveOutlined />} onClick={() => void save()}>保存</Button>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void run('node')}>仅运行此节点</Button>
        <Button icon={<BranchesOutlined />} disabled={running} onClick={() => void run('downstream')}>从此节点运行后续</Button>
      </div>
    </aside>
  )
}

function ProviderModelFields({
  providerOptions,
  modelOptions,
  onProviderChange,
}: {
  providerOptions: Array<{ value: string; label: string }>
  modelOptions: Array<{ value: string; label: string }>
  onProviderChange: () => void
}) {
  return (
    <Space align="start" className="inspector-inline-fields">
      <Form.Item name="provider" label="供应商">
        <Select allowClear options={providerOptions} placeholder="自动选择" onChange={onProviderChange} />
      </Form.Item>
      <Form.Item name="model" label="模型">
        <Select allowClear showSearch optionFilterProp="label" options={modelOptions} placeholder="自动选择" />
      </Form.Item>
    </Space>
  )
}
