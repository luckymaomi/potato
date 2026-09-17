import {
  BranchesOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { aiConfigsApi } from '../../api/aiConfigs'
import { uploadsApi } from '../../api/media'
import { productionApi, type TextPromptDefinition } from '../../api/production'
import { userErrorMessage } from '../../errors/appError'
import { useCanvasStore } from '../../store/canvasStore'
import type { ProviderCatalogStatus, ProviderModel } from '../../types/domain'
import {
  aspectRatioLabel,
  aspectRatiosFor,
  modelCapabilityLabels,
  modelCapabilitySummary,
  modelSupportsMode,
  nodeServiceType,
  preferredAspectRatio,
  providerSupportsMode,
  requiresReferenceImage,
  supportsService,
} from '../providers/catalog'
import {
  materialLabel,
  materialOf,
  productionRole,
  productionStatusLabel,
  textActionOf,
  textActionOptions,
  type MediaGenerationMode,
  type ProductionNodeData,
} from '../production/catalog'
import { GeneratedMediaPreview } from './GeneratedMediaPreview'
import { ReferenceImageInput } from './ReferenceImageInput'

interface CanvasInspectorProps {
  running: boolean
  stopping: boolean
  onRunNode: (nodeId: string) => Promise<void>
  onRunDownstream: (nodeId: string) => Promise<void>
  onStop: () => Promise<void>
}

export function CanvasInspector({ running, stopping, onRunNode, onRunDownstream, onStop }: CanvasInspectorProps) {
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.selectedNodeId) || null)
  const project = useCanvasStore((state) => state.project)
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes)
  const removeNode = useCanvasStore((state) => state.removeNode)
  const saveWorkspace = useCanvasStore((state) => state.save)
  const [uploading, setUploading] = useState(false)
  const [providers, setProviders] = useState<ProviderCatalogStatus[]>([])
  const [models, setModels] = useState<ProviderModel[]>([])
  const [textPrompts, setTextPrompts] = useState<TextPromptDefinition[]>([])
  const [textPromptsError, setTextPromptsError] = useState('')
  const [form] = Form.useForm<ProductionNodeData>()
  const textMode = Form.useWatch('textMode', form) ?? node?.data.textMode
  const generationMode = Form.useWatch('generationMode', form) ?? node?.data.generationMode
  const provider = Form.useWatch('provider', form)
  const model = Form.useWatch('model', form)
  const aspectRatio = Form.useWatch('aspectRatio', form)
  const watchedAction = Form.useWatch('textAction', form)
  const action = node ? (watchedAction || textActionOf(node.data)) : undefined
  const promptDefinition = textPrompts.find((item) => item.key === action)
  const material = node ? materialOf(node.data) : undefined
  const serviceType = nodeServiceType(material, textMode, generationMode)

  useEffect(() => {
    let active = true
    void productionApi.prompts()
      .then(({ items }) => {
        if (!active) return
        setTextPrompts(items)
        setTextPromptsError('')
      })
      .catch((error: unknown) => {
        if (!active) return
        setTextPromptsError(userErrorMessage(error))
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!node) {
      form.resetFields()
      return
    }
    const nodeAction = textActionOf(node.data)
    const defaultPrompt = textPrompts.find((item) => item.key === nodeAction)?.system_prompt
    form.setFieldsValue({
      ...node.data,
      textAction: nodeAction,
      systemPrompt: node.data.systemPrompt ?? defaultPrompt,
    })
  }, [form, node, textPrompts])

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

  const needsReferences = requiresReferenceImage(generationMode)
  const modeProviders = providers.filter((item) => providerSupportsMode(item.capabilities, generationMode)
    && models.some((modelItem) => modelItem.provider === item.id && modelSupportsMode(modelItem, generationMode)))
  const providerOptions = modeProviders.map((item) => ({ value: item.id, label: item.label }))
  const availableModels = models.filter((item) => (!provider || item.provider === provider) && modelSupportsMode(item, generationMode))
  const selectedModel = models.find((item) => item.id === model && (!provider || item.provider === provider))
  const ratioModels = selectedModel ? [selectedModel] : availableModels
  const aspectRatios = aspectRatiosFor(ratioModels)
  const isMediaService = serviceType === 'image' || serviceType === 'video'
  const modelOptions = availableModels.map((item) => ({
    value: item.id,
    label: `${provider ? '' : `${providers.find((entry) => entry.id === item.provider)?.label || item.provider} · `}${item.label} · ${modelCapabilitySummary(item)}`,
    disabled: (needsReferences && item.capabilities.maxReferenceImages === null)
      || (isMediaService && (!item.capabilities.aspectRatios || item.capabilities.aspectRatios.length === 0)),
  }))
  const linkedRecordField = (() => {
    if (node?.data.role === 'character-asset') {
      return { label: '关联角色', options: (project?.characters || []).map((item) => ({ value: item.id, label: item.name })) }
    }
    if (node?.data.role === 'scene-asset') {
      return { label: '关联场景', options: (project?.scenes || []).map((item) => ({ value: item.id, label: item.location })) }
    }
    if (node?.data.role === 'prop-asset') {
      return { label: '关联道具', options: (project?.props || []).map((item) => ({ value: item.id, label: item.name })) }
    }
    if (node?.data.role === 'storyboard-image' || node?.data.role === 'shot-video') {
      return {
        label: '关联分镜',
        options: (project?.episodes || []).flatMap((episode) => (episode.storyboards || []).map((item) => ({
          value: item.id,
          label: `${episode.title || `第 ${episode.episode_number} 集`} · ${item.title || `分镜 ${item.storyboard_number}`}`,
        }))),
      }
    }
    return undefined
  })()

  useEffect(() => {
    if (!node || !isMediaService || !aspectRatios.length) return
    const next = preferredAspectRatio(aspectRatios, aspectRatio)
    if (!next || next === aspectRatio) return
    form.setFieldValue('aspectRatio', next)
    updateNodeData(node.id, { aspectRatio: next })
  }, [aspectRatio, aspectRatios, form, isMediaService, node, updateNodeData])

  if (!node) {
    return (
      <aside className="canvas-inspector canvas-inspector-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个节点进行编辑" />
      </aside>
    )
  }

  const normalizeSystemPrompt = (values: ProductionNodeData): ProductionNodeData => {
    const selectedPrompt = textPrompts.find((item) => item.key === textActionOf(values))?.system_prompt
    return {
      ...values,
      systemPrompt: values.systemPrompt === selectedPrompt ? undefined : values.systemPrompt,
    }
  }

  const applyFields = async () => {
    const values = normalizeSystemPrompt(await form.validateFields())
    updateNodeData(node.id, values)
    return values
  }

  const save = async () => {
    try {
      await applyFields()
      await saveWorkspace()
      message.success('节点和画布已保存')
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const run = async (scope: 'node' | 'downstream') => {
    try {
      await applyFields()
      if (scope === 'node') await onRunNode(node.id)
      else await onRunDownstream(node.id)
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const uploadReference = async (file: File): Promise<string | undefined> => {
    if (!project) return undefined
    setUploading(true)
    try {
      const uploaded = await uploadsApi.image(file, project.id)
      message.success('参考图已上传')
      return uploaded.url
    } catch (error) {
      message.error(userErrorMessage(error))
      return undefined
    } finally {
      setUploading(false)
    }
  }

  const restoreDefaultPrompt = () => {
    if (!promptDefinition) return
    form.setFieldValue('systemPrompt', promptDefinition.system_prompt)
    updateNodeData(node.id, { systemPrompt: undefined })
  }

  const onValuesChange = (changed: Partial<ProductionNodeData>) => {
    if (changed.textAction) {
      const nextDefault = textPrompts.find((item) => item.key === changed.textAction)?.system_prompt
      form.setFieldValue('systemPrompt', nextDefault)
      updateNodeData(node.id, { textAction: changed.textAction, systemPrompt: undefined })
      return
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'systemPrompt')) {
      updateNodeData(node.id, {
        systemPrompt: changed.systemPrompt === promptDefinition?.system_prompt ? undefined : changed.systemPrompt,
      })
      return
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'linkedRecordId')) {
      updateNodeData(node.id, { linkedRecordId: changed.linkedRecordId, linkedRecordIndex: undefined })
      return
    }
    updateNodeData(node.id, changed)
  }

  const mediaModeOptions: Array<{ value: MediaGenerationMode; label: string }> = material === 'video'
    ? [{ value: 'text-to-video', label: '文生视频' }, { value: 'image-to-video', label: '图生视频' }]
    : [{ value: 'text-to-image', label: '文生图' }, { value: 'image-to-image', label: '图生图' }]

  return (
    <aside className="canvas-inspector">
      <div className="inspector-heading">
        <div>
          <Typography.Text type="secondary">{materialLabel(materialOf(node.data))}</Typography.Text>
          <h2>{node.data.title || productionRole(node.data.role).label}</h2>
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
        <Tag>{productionRole(node.data.role).label}</Tag>
        <Tag>{productionStatusLabel(node.data.status)}</Tag>
        {node.data.taskId && <Typography.Text type="secondary" ellipsis>任务 {node.data.taskId}</Typography.Text>}
      </div>

      <Form form={form} layout="vertical" requiredMark={false} onValuesChange={onValuesChange}>
        <Form.Item name="title" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input maxLength={80} />
        </Form.Item>

        <Divider>内容与生成</Divider>
        {material === 'text' ? (
          <>
            <Form.Item name="textMode" label="内容方式">
              <Select options={[{ value: 'manual', label: '手动编辑，不调用 API' }, { value: 'ai', label: '使用文本 API' }]} />
            </Form.Item>
            {textMode === 'ai' && (
              <>
                <Form.Item name="textAction" label="AI 操作">
                  <Select options={[...textActionOptions]} disabled={node.data.role !== 'generic-text'} />
                </Form.Item>
                <Form.Item
                  name="systemPrompt"
                  label={(
                    <span className="system-prompt-label">
                      <span>系统提示词</span>
                      <Button type="link" size="small" icon={<ReloadOutlined />} disabled={!promptDefinition} onClick={restoreDefaultPrompt}>恢复默认</Button>
                    </span>
                  )}
                  extra={promptDefinition?.description || textPromptsError || '正在读取默认提示词…'}
                  rules={[{ required: true, whitespace: true, message: '系统提示词不能为空，可恢复默认值' }]}
                >
                  <Input.TextArea rows={10} placeholder="默认提示词会完整显示在这里" />
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
            {action === 'split-storyboards' && textMode === 'ai' && (
              <Form.Item name="storyboardCount" label="分镜数量">
                <InputNumber min={1} max={20} precision={0} placeholder="自动" />
              </Form.Item>
            )}
            <Form.Item name="text" label="文本内容">
              <Input.TextArea rows={12} placeholder="输入故事、剧本、提示词或整理结果" />
            </Form.Item>
          </>
        ) : (
          <>
            {linkedRecordField && (
              <Form.Item name="linkedRecordId" label={linkedRecordField.label} extra="连线上游会自动匹配，也可以在这里明确指定。">
                <Select allowClear showSearch optionFilterProp="label" options={linkedRecordField.options} placeholder="自动匹配上游记录" />
              </Form.Item>
            )}
            <Form.Item name="generationMode" label="生成方式">
              <Select options={mediaModeOptions} onChange={() => form.setFieldValue('model', undefined)} />
            </Form.Item>
            <Form.Item name="prompt" label="提示词" extra="也可以留空，由运行时连接的上游文本提供。">
              <Input.TextArea rows={7} placeholder="描述主体、环境、动作、风格和镜头" />
            </Form.Item>
            {needsReferences && (
              <Form.Item
                name="referenceImages"
                label={!selectedModel
                  ? '参考图（也会自动使用连线传入的图片）'
                  : selectedModel.capabilities.maxReferenceImages === null
                    ? '参考图（上限未知）'
                    : `参考图（最多 ${selectedModel.capabilities.maxReferenceImages} 张）`}
              >
                <ReferenceImageInput
                  uploading={uploading}
                  onUpload={uploadReference}
                  maxCount={selectedModel?.capabilities.maxReferenceImages ?? undefined}
                />
              </Form.Item>
            )}
            <Space align="start" className="inspector-inline-fields">
              <Form.Item name="provider" label="供应商">
                <Select allowClear options={providerOptions} placeholder="自动选择" onChange={() => form.setFieldValue('model', undefined)} />
              </Form.Item>
              <Form.Item name="model" label="模型">
                <Select allowClear showSearch optionFilterProp="label" options={modelOptions} placeholder="自动选择" />
              </Form.Item>
              {material === 'video' && (
                <Form.Item name="duration" label="时长（秒）"><InputNumber min={1} max={60} /></Form.Item>
              )}
            </Space>
            {isMediaService && (
              <Form.Item
                name="aspectRatio"
                label="生成画幅比例"
                rules={[{ required: true, message: '请选择当前模型支持的画幅比例' }]}
                extra={selectedModel?.capabilities.aspectRatios === null ? '该模型的比例能力未知，刷新目录后才能安全生成。' : undefined}
              >
                <Select
                  disabled={!aspectRatios.length}
                  placeholder={aspectRatios.length ? '选择画幅比例' : '当前模型没有可用比例'}
                  options={aspectRatios.map((ratio) => ({ value: ratio, label: aspectRatioLabel(ratio) }))}
                />
              </Form.Item>
            )}
            {selectedModel && (
              <div className="model-capability-summary">
                <Typography.Text strong>{selectedModel.label}</Typography.Text>
                <Space size={[4, 4]} wrap>
                  {modelCapabilityLabels(selectedModel).map((label) => <Tag key={label}>{label}</Tag>)}
                </Space>
              </div>
            )}
            <GeneratedMediaPreview data={node.data} />
          </>
        )}
      </Form>

      {node.data.status === 'failed' && <div className="node-error-message">{node.data.error || '运行失败，请检查配置后重试。'}</div>}
      {node.data.status === 'cancelled' && <div className="node-stopped-message">运行已停止，后续节点没有继续提交。</div>}

      <div className="inspector-actions">
        <Button icon={<SaveOutlined />} disabled={running} onClick={() => void save()}>保存</Button>
        {running ? (
          <Button danger icon={<StopOutlined />} loading={stopping} onClick={() => void onStop()}>停止运行</Button>
        ) : (
          <>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void run('node')}>仅运行此节点</Button>
            <Button icon={<BranchesOutlined />} onClick={() => void run('downstream')}>从此节点运行后续</Button>
          </>
        )}
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
  modelOptions: Array<{ value: string; label: string; disabled?: boolean }>
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
