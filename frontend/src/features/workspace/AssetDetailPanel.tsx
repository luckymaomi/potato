import {
  BuildOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HistoryOutlined,
  RobotOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Button, Form, Image, Input, List, Popconfirm, Select, Space, Tag, Typography, Upload, type FormInstance } from 'antd'
import type { MediaGenerationHistory } from '../../api/media'
import type { ProjectAsset } from '../../types/domain'
import type { ProviderModel } from '../../types/domain'
import { mediaUrl } from '../../utils/mediaUrl'
import { GenerationElapsedTime } from '../generation/GenerationElapsedTime'
import { assetGenerationStatus, type AssetGenerationState } from './assetGenerationStatus'
import { assetLabels, banImageTextOptions, outputTypeOptions, profileGroups, referenceLockOptions, type AssetFormValues } from './assetWorkspaceConfig'
import { modelCapabilitySummary, aspectRatioLabel } from '../providers/catalog'
import { autoSaveLabel, type AutoSaveStatus } from './useDebouncedAutoSave'

export function AssetDetailPanel({
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
  autoSaveStatus,
  onRemove,
  onGenerate,
  onAssemble,
  onStop,
  onSelectGeneration,
  onDeleteGeneration,
  onUploadStandard,
  onUploadInputReference,
  onReferencesChange,
  imageModel,
  imageModelLabel,
  aspectRatioOptions,
  maxReferenceImages,
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
  autoSaveStatus: AutoSaveStatus
  onRemove: () => void
  onGenerate: () => void
  onAssemble: () => void
  onStop: () => void
  onSelectGeneration: (id: number) => void
  onDeleteGeneration: (id: number) => void
  onUploadStandard: (file: File) => Promise<void>
  onUploadInputReference: (file: File) => Promise<void>
  onReferencesChange: (values: string[]) => void
  imageModel?: ProviderModel
  imageModelLabel: string
  aspectRatioOptions: string[]
  maxReferenceImages: number | null
}) {
  const selectedAspectRatio = Form.useWatch('aspect_ratio', form)
  if (!selected) return <aside className="asset-detail-panel asset-detail-panel-empty"><span>选择一张资产卡查看详情</span></aside>
  const active = track?.status === 'pending' || track?.status === 'processing'
  const generateBlockedReason = !imageModel
    ? '请到 AI 配置手选图片预设'
    : !aspectRatioOptions.length
      ? '当前图片模型没有可选手选画幅'
      : !selectedAspectRatio
        ? '请选择图片画幅'
        : undefined
  return <aside className="asset-detail-panel">
    <div className="asset-detail-header">
      <div><span>{assetLabels[selected.kind]}</span><strong>{selected.name}</strong></div>
      <span className={`auto-save-hint is-${autoSaveStatus}`} aria-live="polite">
        <SaveOutlined style={{ marginRight: 4 }} />
        {autoSaveLabel(autoSaveStatus)}
      </span>
    </div>
    <div className="asset-detail-scroll">
      <Form form={form} layout="vertical" className="asset-detail-form" onValuesChange={onDraftChange}>
        <div className="asset-standard-stage">
          {selected.image_url ? <>
            <Image preview={{ toolbarRender: (originalNode) => <>{originalNode}<Button type="text" icon={<DownloadOutlined />} href={mediaUrl(selected.image_url)} download={`${selected.name || 'asset'}-原图`} aria-label="下载原图" title="下载原图" /></> }} src={mediaUrl(selected.image_url)} alt={selected.name} />
          </> : <div className="asset-standard-empty"><span>标准资产图</span><strong>还没有标准资产图</strong></div>}
          <AssetStatusBadge state={state} hasImage={Boolean(selected.image_url)} />
          <div className="asset-standard-status">
            <Tag color={selected.image_url ? 'green' : 'default'}>{selected.image_url ? '标准资产图' : '等待上传或生成'}</Tag>
            {selected.image_url ? <Button size="small" icon={<DownloadOutlined />} href={mediaUrl(selected.image_url)} download={`${selected.name || 'asset'}-original`}>下载原图</Button> : null}
            <Upload showUploadList={false} accept="image/jpeg,image/png,image/gif,image/webp" customRequest={async ({ file, onSuccess, onError }) => {
              try { await onUploadStandard(file as File); onSuccess?.(file) } catch (reason) { onError?.(reason as Error) }
            }}><Button size="small" icon={<CloudUploadOutlined />}>上传标准图</Button></Upload>
          </div>
        </div>
        <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: '请输入资产卡名称' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="资产卡名称" />
        </Form.Item>
        {profileGroups[selected.kind].map((group) => <section className="asset-profile-group" key={group.title}>
          <div className="asset-panel-heading"><strong>{group.title}</strong></div>
          <div className="asset-profile-grid">{group.fields.map((profileField) => (
            <Form.Item key={profileField.key} name={['text_profile', profileField.key]} label={profileField.label}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} />
            </Form.Item>
          ))}</div>
        </section>)}
        <section className="asset-output-prompt-panel">
          <div className="asset-panel-heading"><strong>生成提示词</strong></div>
          <div className="asset-output-controls">
            <Form.Item name="reference_lock" label="图片参考锁定">
              <Select allowClear placeholder="不选则不组装锁定段" options={referenceLockOptions[selected.kind]} />
            </Form.Item>
            <Form.Item name="ban_image_text" label="画面禁字">
              <Select allowClear placeholder="不选则不组装禁字段" options={banImageTextOptions} />
            </Form.Item>
            <Form.Item name="output_type" label="预设模板" rules={[{ required: true, message: '请选择预设模板' }]}><Select options={outputTypeOptions[selected.kind]} /></Form.Item>
            <Button icon={<BuildOutlined />} loading={assembling} onClick={onAssemble}>组装提示词</Button>
          </div>
          <Form.Item name="output_prompt" label="最终生成提示词"><Input.TextArea autoSize={{ minRows: 9, maxRows: 24 }} placeholder="填写标准资产图提示词" /></Form.Item>
        </section>
        <section className="asset-generation-panel">
          <div className="asset-panel-heading"><strong>生成标准资产图</strong><RobotOutlined /></div>
          <div className="asset-model-capability">
            <span>图片模型 · {imageModelLabel}</span>
            <Typography.Text type="secondary">{imageModel ? modelCapabilitySummary(imageModel) : '请到 AI 配置手选图片预设'}</Typography.Text>
          </div>
          {aspectRatioOptions.length ? <Form.Item name="aspect_ratio" label="图片画幅" rules={[{ required: true, message: '请选择图片画幅' }]}><Select placeholder="请选择图片画幅" options={aspectRatioOptions.map((value) => ({ value, label: aspectRatioLabel(value) }))} /></Form.Item> : <Typography.Text type="secondary">{imageModel ? '当前模型没有可验证的图片画幅，无法生成' : '未选择图片模型，无法选择画幅'}</Typography.Text>}
          {track ? <GenerationElapsedTime startedAt={track.startedAt} finishedAt={track.finishedAt} active={active} progress={track.progress} message={track.message} /> : null}
          <div className="asset-reference-heading"><span>输入参考图 · {references.length} 张{maxReferenceImages === null ? '' : ` / ${maxReferenceImages}`}</span><Upload showUploadList={false} accept="image/*" multiple disabled={maxReferenceImages !== null && references.length >= maxReferenceImages} customRequest={async ({ file, onSuccess, onError }) => {
            try { await onUploadInputReference(file as File); onSuccess?.(file) } catch (reason) { onError?.(reason as Error) }
          }}><Button size="small" icon={<CloudUploadOutlined />} disabled={maxReferenceImages !== null && references.length >= maxReferenceImages}>添加参考图</Button></Upload></div>
          <div className="asset-reference-grid">{references.length ? references.map((url) => <div className="asset-reference-item" key={url}><Image width={64} height={64} src={mediaUrl(url)} preview={{ mask: '查看' }} /><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="移除参考图" onClick={() => onReferencesChange(references.filter((item) => item !== url))} /></div>) : <span className="asset-reference-empty">暂无输入参考图</span>}</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            {generateBlockedReason ? <Typography.Text type="danger">{generateBlockedReason}</Typography.Text> : null}
            <Button type="primary" block loading={generating} disabled={Boolean(generateBlockedReason) || generating} onClick={onGenerate}>{generating ? assetGenerationStatus(state).label : '生成标准图'}</Button>
            {active ? <Button block danger icon={<StopOutlined />} onClick={onStop}>停止生成</Button> : null}
          </Space>
        </section>
        <section className="asset-history-panel">
          <div className="asset-panel-heading"><strong>标准图历史</strong><HistoryOutlined /></div>
          <List size="small" locale={{ emptyText: '还没有生成历史' }} dataSource={history} renderItem={(item) => {
            const canManage = item.status === 'completed' && item.available
            return <List.Item actions={[
              <Button key="select" size="small" disabled={!canManage} onClick={() => onSelectGeneration(item.id)}>选用</Button>,
              <Popconfirm key="delete" title="删除这张标准图历史？" description="本地归档文件会一起删掉；若它是当前标准图，当前指针会清空。" okText="删除" cancelText="取消" disabled={!canManage} onConfirm={() => onDeleteGeneration(item.id)}>
                <Button size="small" type="text" danger disabled={!canManage} icon={<DeleteOutlined />} aria-label="删除这张标准图历史" />
              </Popconfirm>,
            ]}>
            <List.Item.Meta avatar={item.image_url ? <Image width={48} height={48} src={mediaUrl(item.image_url)} preview={{ mask: '查看', toolbarRender: (originalNode) => <>{originalNode}<Button type="text" icon={<DownloadOutlined />} href={mediaUrl(item.image_url)} download={`asset-${item.id}-原图`} aria-label="下载原图" title="下载原图" /></> }} /> : undefined} title={<Space size={5}><Tag>{assetGenerationStatus({ status: item.status, message: item.error_msg ?? undefined }, Boolean(item.image_url)).label}</Tag><span>{item.provider === 'local-upload' ? '本地上传' : (item.provider ?? '未提交')}</span></Space>} description={item.status === 'pending' || item.status === 'processing' ? <GenerationElapsedTime startedAt={item.created_at} active progress={undefined} message="进行中" /> : item.status === 'failed' ? item.error_msg : item.prompt || '无提示词'} />
          </List.Item>
          }} />
        </section>
        <Popconfirm title="删除这个资产卡？" description="分镜中的引用也会移除。" okText="删除" cancelText="取消" onConfirm={onRemove}><Button danger icon={<DeleteOutlined />} loading={deleting}>删除资产卡</Button></Popconfirm>
      </Form>
    </div>
  </aside>
}

export function AssetStatusBadge({ state, hasImage }: { state?: AssetGenerationState; hasImage: boolean }) {
  const status = assetGenerationStatus(state, hasImage)
  return <span className={`asset-tile-status is-${status.tone}`} role="status" aria-live="polite" title={state?.message}>{status.label}</span>
}
