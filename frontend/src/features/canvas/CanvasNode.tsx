import {
  ApartmentOutlined,
  BulbOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  PictureOutlined,
  ToolOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Progress } from 'antd'
import type { ReactNode } from 'react'
import {
  assetKindOf,
  materialLabel,
  materialOf,
  productionPlugin,
  productionStatusLabel,
  type ProductionNodeData,
} from '../production/catalog'
import type { CanvasNode } from './canvasTypes'
import { isVideoMedia } from './mediaPresentation'

function nodeIcon(data: ProductionNodeData): ReactNode {
  const kind = assetKindOf(data)
  if (kind === 'character') return <UserOutlined />
  if (kind === 'scene') return <EnvironmentOutlined />
  if (kind === 'prop') return <ToolOutlined />
  if (data.role === 'storyboard-plan' || data.role === 'storyboard-image') return <ApartmentOutlined />
  if (data.role === 'story') return <BulbOutlined />
  if (materialOf(data) === 'video') return <VideoCameraOutlined />
  if (materialOf(data) === 'image') return <PictureOutlined />
  return <FileTextOutlined />
}

export function CanvasNodeView({ data, selected }: NodeProps<CanvasNode>) {
  const material = materialOf(data)
  const isText = material === 'text'
  const isVideo = isVideoMedia(data)
  const summary = isText ? (data.result.text || data.parameters.text) : data.parameters.prompt
  return (
    <div className={`canvas-node canvas-node-${material} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="input" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="output" className="canvas-handle" />
      <div className="canvas-node-header">
        <span className="canvas-node-icon">{nodeIcon(data)}</span>
        <span className="canvas-node-kind">{productionPlugin(data.role).label}</span>
        {!isText && data.parameters.aspectRatio && <span className="canvas-node-ratio">{data.parameters.aspectRatio}</span>}
        {data.status && data.status !== 'idle' && (
          <span className={`canvas-node-status status-${data.status}`}>{productionStatusLabel(data.status)}</span>
        )}
      </div>
      <div className="canvas-node-title">{data.title || productionPlugin(data.role).label}</div>
      {data.result.outputUrl ? (
        isVideo
          ? <video className="canvas-node-media" src={data.result.outputUrl} muted preload="metadata" />
          : <img className="canvas-node-media" src={data.result.outputUrl} alt={`${data.title || productionPlugin(data.role).label}生成结果`} />
      ) : (
        <div className="canvas-node-empty">
          {summary ? String(summary).slice(0, 112) : `${materialLabel(material)}，选择后在右侧编辑`}
        </div>
      )}
      {data.result.taskId && <div className="canvas-node-task">任务 {data.result.taskId.slice(0, 8)}…</div>}
      {(data.status === 'pending' || data.status === 'running') && data.execution && (
        <div className="canvas-node-progress">
          <Progress percent={data.execution.progress} size="small" showInfo={typeof data.execution.progress === 'number'} />
          <span>{data.execution.message}</span>
        </div>
      )}
    </div>
  )
}
