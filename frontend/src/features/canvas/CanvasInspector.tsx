import {
  BranchesOutlined,
  CopyOutlined,
  DeleteOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
  VideoCameraOutlined,
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
  Progress,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { aiConfigsApi } from '../../api/aiConfigs'
import { mediaHistoryApi, uploadsApi, type MediaGenerationHistory } from '../../api/media'
import { productionApi, type TextPromptDefinition } from '../../api/production'
import { userErrorMessage } from '../../errors/appError'
import { useCanvasStore } from '../../store/canvasStore'
import type { ProviderCatalogStatus, ProviderModel, ServiceType } from '../../types/domain'
import {
  aspectRatioLabel,
  aspectRatiosFor,
  modelCapabilityLabels,
  modelSupportsMode,
  preferredAspectRatio,
  providerSupportsMode,
  requiresReferenceImage,
  supportsService,
} from '../providers/catalog'
import {
  materialLabel,
  productionPlugin,
  productionStatusLabel,
  type MediaGenerationMode,
  type ProductionMethod,
  type ProductionNodeData,
} from '../production/catalog'
import { GeneratedMediaPreview } from './GeneratedMediaPreview'
import { ReferenceImageInput } from './ReferenceImageInput'
import { historyVersionLabels, modelOptionLabel } from './inspectorPresentation'

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
  const [history, setHistory] = useState<MediaGenerationHistory[]>([])
  const [form] = Form.useForm<ProductionNodeData>()
  const plugin = node ? productionPlugin(node.data.role) : undefined
  const selectedNodeId = node?.id
  const selectedProjectId = project?.id
  const selectedMaterial = plugin?.material
  const historyGenerationKey = node ? [
    node.data.result.generationId,
    ...(node.data.history || []).map((item) => item.generationId),
  ].filter((value): value is number => typeof value === 'number' && value > 0).join(',') : ''
  const method = Form.useWatch(['parameters', 'method'], form) ?? node?.data.parameters.method
  const provider = Form.useWatch(['parameters', 'provider'], form)
  const model = Form.useWatch(['parameters', 'model'], form)
  const aspectRatio = Form.useWatch(['parameters', 'aspectRatio'], form)
  const mediaMode = isMediaMethod(method) ? method : undefined
  const serviceType: ServiceType | undefined = plugin?.defaultMethod === 'compose'
    ? undefined
    : plugin?.material === 'text'
      ? method === 'ai-text' ? 'text' : undefined
      : plugin?.material

  useEffect(() => {
    let active = true
    void productionApi.prompts().then(({ items }) => active && setTextPrompts(items)).catch(() => active && setTextPrompts([]))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedNodeId) return form.resetFields()
    const selected = useCanvasStore.getState().nodes.find((item) => item.id === selectedNodeId)
    if (!selected) return form.resetFields()
    const currentProject = useCanvasStore.getState().project
    form.resetFields()
    form.setFieldsValue({
      ...selected.data,
      parameters: {
        ...selected.data.parameters,
        systemPrompt: selected.data.parameters.systemPrompt,
        episodeId: selected.data.parameters.episodeId ?? selected.data.assetRefs.episodes?.[0] ?? currentProject?.episodes?.[0]?.id,
      },
    })
  }, [form, selectedNodeId])

  useEffect(() => {
    if (!node?.id || node.data.parameters.systemPrompt !== undefined) return
    const prompt = textPrompts.find((item) => item.key === productionPlugin(node.data.role).promptKey)
    if (prompt && !form.getFieldValue(['parameters', 'systemPrompt'])) form.setFieldValue(['parameters', 'systemPrompt'], prompt.system_prompt)
  }, [form, node?.id, node?.data.parameters.systemPrompt, node?.data.role, textPrompts])

  useEffect(() => {
    if (!serviceType) {
      return
    }
    let active = true
    void Promise.all([aiConfigsApi.providers(), aiConfigsApi.models({ service_type: serviceType })])
      .then(([providerItems, modelItems]) => {
        if (!active) return
        setProviders(providerItems.filter((item) => item.enabled && item.configured && supportsService(item.capabilities, serviceType)))
        setModels(modelItems)
      })
      .catch(() => { if (active) { setProviders([]); setModels([]) } })
    return () => { active = false }
  }, [serviceType])

  useEffect(() => {
    if (!selectedNodeId || !selectedProjectId || (selectedMaterial !== 'image' && selectedMaterial !== 'video')) {
      void Promise.resolve().then(() => setHistory([]))
      return
    }
    const generationIds = new Set(historyGenerationKey.split(',').map(Number).filter((value) => Number.isInteger(value) && value > 0))
    if (!generationIds.size) {
      void Promise.resolve().then(() => setHistory([]))
      return
    }
    let active = true
    const load = selectedMaterial === 'image' ? mediaHistoryApi.images(selectedProjectId) : mediaHistoryApi.videos(selectedProjectId)
    void load.then(({ items }) => {
      if (!active) return
      setHistory(items.filter((item) => generationIds.has(item.id)))
    }).catch(() => active && setHistory([]))
    return () => { active = false }
  }, [historyGenerationKey, selectedMaterial, selectedNodeId, selectedProjectId])

  const availableModels = models.filter((item) => (!provider || item.provider === provider) && modelSupportsMode(item, mediaMode))
  const selectedModel = models.find((item) => item.id === model && (!provider || item.provider === provider))
  const aspectRatios = aspectRatiosFor(selectedModel ? [selectedModel] : availableModels)
  const providerOptions = providers.filter((item) => providerSupportsMode(item.capabilities, mediaMode)
    && models.some((modelItem) => modelItem.provider === item.id && modelSupportsMode(modelItem, mediaMode)))
    .map((item) => ({ value: item.id, label: item.label }))
  const modelOptions = availableModels.map((item) => ({
    value: item.id,
    label: modelOptionLabel(item),
  }))
  const defaultPrompt = textPrompts.find((item) => item.key === plugin?.promptKey)
  const historyLabels = historyVersionLabels(history, plugin?.material === 'video' ? 'video' : 'image')

  useEffect(() => {
    if (!node || !serviceType || serviceType === 'text' || !aspectRatios.length) return
    const next = preferredAspectRatio(aspectRatios, aspectRatio)
    if (!next || next === aspectRatio) return
    form.setFieldValue(['parameters', 'aspectRatio'], next)
    updateNodeData(node.id, { parameters: { aspectRatio: next } })
  }, [aspectRatio, aspectRatios, form, node, serviceType, updateNodeData])

  if (!node || !plugin) return <aside className="canvas-inspector canvas-inspector-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个节点进行编辑" /></aside>

  const applyFields = async () => {
    const values = await form.validateFields()
    const parameters = {
      ...values.parameters,
      systemPrompt: values.parameters.systemPrompt === defaultPrompt?.system_prompt ? undefined : values.parameters.systemPrompt,
    }
    updateNodeData(node.id, { ...values, parameters })
    return values
  }
  const save = async () => {
    try { await applyFields(); await saveWorkspace(); message.success('节点和画布已保存') } catch (error) { message.error(userErrorMessage(error)) }
  }
  const run = async (scope: 'node' | 'downstream') => {
    try { await applyFields(); await (scope === 'node' ? onRunNode(node.id) : onRunDownstream(node.id)) } catch (error) { message.error(userErrorMessage(error)) }
  }
  const uploadReference = async (file: File): Promise<string | undefined> => {
    if (!project) return undefined
    setUploading(true)
    try { return (await uploadsApi.image(file, project.id)).url } catch (error) { message.error(userErrorMessage(error)); return undefined } finally { setUploading(false) }
  }
  const selectHistory = async (id: number) => {
    try {
      const selected = history.find((item) => item.id === id)
      if (!selected || selected.status !== 'completed' || !selected.available || !selected.local_path) throw new Error('只能选用本地文件真实存在的已完成版本')
      const outputUrl = selected.image_url || selected.video_url || undefined
      updateNodeData(node.id, { result: { ...node.data.result, outputUrl, generationId: selected.id, localPath: selected.local_path || undefined, mediaAvailable: selected.available } })
      message.success('已切换当前采用版本')
    } catch (error) { message.error(userErrorMessage(error)) }
  }
  const onValuesChange = (changed: Partial<ProductionNodeData>) => {
    if (changed.parameters?.systemPrompt !== undefined) {
      updateNodeData(node.id, { parameters: { systemPrompt: changed.parameters.systemPrompt === defaultPrompt?.system_prompt ? undefined : changed.parameters.systemPrompt } })
      return
    }
    updateNodeData(node.id, changed)
  }

  return (
    <aside className="canvas-inspector">
      <div className="inspector-heading">
        <div><Typography.Text type="secondary">{materialLabel(plugin.material)}</Typography.Text><h2>{node.data.title || plugin.label}</h2></div>
        <Space size={2}>
          <Tooltip title="复制节点"><Button type="text" icon={<CopyOutlined />} aria-label="复制节点" onClick={() => duplicateNodes([node.id])} /></Tooltip>
          <Popconfirm title="删除节点" description="相连的连线也会一并删除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeNode(node.id)}>
            <Tooltip title="删除节点"><Button type="text" danger icon={<DeleteOutlined />} aria-label="删除节点" /></Tooltip>
          </Popconfirm>
        </Space>
      </div>
      <div className="inspector-status-row">
        <Tag>{plugin.label}</Tag><Tag>{productionStatusLabel(node.data.status)}</Tag>
        {node.data.result.taskId && <Typography.Text type="secondary" ellipsis>任务 {node.data.result.taskId}</Typography.Text>}
      </div>
      {(node.data.status === 'pending' || node.data.status === 'running') && node.data.execution && (
        <div className="inspector-execution-status">
          <Typography.Text strong>{node.data.execution.message}</Typography.Text>
          {typeof node.data.execution.progress === 'number' && <Progress percent={node.data.execution.progress} size="small" />}
        </div>
      )}

      <Form form={form} layout="vertical" requiredMark={false} onValuesChange={onValuesChange} onSubmitCapture={(event) => event.preventDefault()}>
        <Form.Item name="title" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input maxLength={80} /></Form.Item>
        <Divider>插件参数</Divider>
        {plugin.parameters.some((item) => item.control === 'episode') && (
          <Form.Item name={['parameters', 'episodeId']} label="输出剧集" rules={[{ required: true, message: '请选择输出剧集' }]}>
            <Select options={(project?.episodes || []).map((episode) => ({ value: episode.id, label: episode.title || `第 ${episode.episode_number} 集` }))} />
          </Form.Item>
        )}
        {plugin.methods.length > 1 && (
          <Form.Item name={['parameters', 'method']} label="生成方式"><Select options={plugin.methods.map((value) => ({ value, label: methodLabel(value) }))} onChange={() => form.setFieldValue(['parameters', 'model'], undefined)} /></Form.Item>
        )}
        {plugin.material === 'text' && (
          <>
            {method === 'ai-text' && (
              <>
                <Form.Item name={['parameters', 'systemPrompt']} label={<span className="system-prompt-label"><span>系统提示词</span><Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => form.setFieldValue(['parameters', 'systemPrompt'], defaultPrompt?.system_prompt)}>恢复默认</Button></span>} rules={[{ required: true, whitespace: true, message: '系统提示词不能为空' }]}>
                  <Input.TextArea rows={10} />
                </Form.Item>
                <ProviderModelFields providerOptions={providerOptions} modelOptions={modelOptions} form={form} />
              </>
            )}
            {plugin.parameters.some((item) => item.key === 'storyboardCount') && <Form.Item name={['parameters', 'storyboardCount']} label="分镜数量"><InputNumber min={1} max={20} precision={0} /></Form.Item>}
            <Form.Item name={['parameters', 'text']} label="节点文本"><Input.TextArea rows={12} placeholder="运行后文本结果保存在节点结果中" /></Form.Item>
            {node.data.result.text && <Typography.Paragraph copyable>{node.data.result.text}</Typography.Paragraph>}
          </>
        )}
        {(plugin.material === 'image' || (plugin.material === 'video' && plugin.defaultMethod !== 'compose')) && (
          <>
            <Form.Item name={['parameters', 'prompt']} label="提示词" rules={[{ required: true, whitespace: true, message: '请填写本节点提示词' }]}><Input.TextArea rows={7} /></Form.Item>
            {requiresReferenceImage(mediaMode) && <Form.Item name={['parameters', 'referenceImages']} label="补充参考图"><ReferenceImageInput uploading={uploading} onUpload={uploadReference} maxCount={selectedModel?.capabilities.maxReferenceImages ?? undefined} /></Form.Item>}
            <ProviderModelFields providerOptions={providerOptions} modelOptions={modelOptions} form={form} />
            {plugin.material === 'video' && <Form.Item name={['parameters', 'duration']} label="时长（秒）"><InputNumber min={3} max={5} /></Form.Item>}
            <Form.Item name={['parameters', 'aspectRatio']} label="生成画幅比例" rules={[{ required: true, message: '请选择画幅比例' }]}><Select disabled={!aspectRatios.length} options={aspectRatios.map((ratio) => ({ value: ratio, label: aspectRatioLabel(ratio) }))} /></Form.Item>
            {selectedModel && <div className="model-capability-summary"><Typography.Text strong>{modelOptionLabel(selectedModel)}</Typography.Text><div className="model-capability-labels">{modelCapabilityLabels(selectedModel).map((label) => <Tag key={label}>{label}</Tag>)}</div></div>}
          </>
        )}
        <GeneratedMediaPreview data={node.data} />
        {history.length > 0 && (
          <Form.Item label="生成历史" extra="按时间保留全部已落盘版本，可直接切换。">
            <Select
              value={node.data.result.generationId}
              onChange={(value) => void selectHistory(value)}
              popupMatchSelectWidth
              options={history.map((item) => ({
                value: item.id,
                disabled: item.status !== 'completed' || !item.available,
                label: (
                  <span className="history-version-option">
                    <span className="history-version-thumb">
                      {item.image_url ? <img src={item.image_url} alt="" /> : item.video_url ? <VideoCameraOutlined /> : <PictureOutlined />}
                    </span>
                    <span>{historyLabels.get(item.id)}</span>
                  </span>
                ),
              }))}
            />
          </Form.Item>
        )}
      </Form>

      {node.data.status === 'failed' && <div className="node-error-message">{node.data.error || '运行失败，请检查配置后重试。'}</div>}
      {node.data.status === 'cancelled' && <div className="node-stopped-message">运行已停止，后续节点没有继续提交。</div>}
      <div className="inspector-actions">
        <Button icon={<SaveOutlined />} disabled={running} onClick={() => void save()}>保存</Button>
        {running ? <Button danger icon={<StopOutlined />} loading={stopping} onClick={() => void onStop()}>停止运行</Button> : <><Tooltip title="只运行当前节点；已完成的直接入边会作为附加输入"><Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void run('node')}>运行此节点</Button></Tooltip><Button icon={<BranchesOutlined />} onClick={() => void run('downstream')}>从此节点运行后续</Button></>}
      </div>
    </aside>
  )
}

function ProviderModelFields({ providerOptions, modelOptions, form }: { providerOptions: Array<{ value: string; label: string }>; modelOptions: Array<{ value: string; label: string }>; form: ReturnType<typeof Form.useForm<ProductionNodeData>>[0] }) {
  return <div className="inspector-inline-fields"><Form.Item name={['parameters', 'provider']} label="供应商"><Select allowClear options={providerOptions} placeholder="自动选择" onChange={() => form.setFieldValue(['parameters', 'model'], undefined)} /></Form.Item><Form.Item name={['parameters', 'model']} label="模型"><Select allowClear showSearch optionFilterProp="label" options={modelOptions} placeholder="自动选择" /></Form.Item></div>
}

function isMediaMethod(method: ProductionMethod | undefined): method is MediaGenerationMode {
  return method === 'text-to-image' || method === 'image-to-image' || method === 'text-to-video' || method === 'image-to-video'
}

function methodLabel(method: ProductionMethod): string {
  return { 'manual-text': '手动文本', 'ai-text': '文本 API', 'text-to-image': '文生图', 'image-to-image': '图生图', 'text-to-video': '文生视频', 'image-to-video': '图生视频', compose: '整集合成' }[method]
}
