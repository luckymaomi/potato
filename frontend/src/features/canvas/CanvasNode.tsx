import {
  ApartmentOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  PictureOutlined,
  ToolOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ReactNode } from 'react'
import type { CanvasNode, CanvasNodeKind } from '../../store/workbenchStore'

const labels: Record<string, string> = { text: '文本', image: '图片', video: '视频', character: '角色', scene: '场景', prop: '道具', storyboard: '分镜' }
const icons: Record<CanvasNodeKind, ReactNode> = {
  text: <FileTextOutlined />,
  image: <PictureOutlined />,
  video: <VideoCameraOutlined />,
  character: <UserOutlined />,
  scene: <EnvironmentOutlined />,
  prop: <ToolOutlined />,
  storyboard: <ApartmentOutlined />,
}

const statusLabels: Record<string, string> = {
  completed: '已完成',
  failed: '失败',
  pending: '排队中',
  processing: '生成中',
}

export function CanvasNodeView({ data, selected }: NodeProps<CanvasNode>) {
  const isText = data.preset === 'text'
  const isVideo = data.mediaKind === 'video'
    || data.preset === 'video'
    || data.mode === 'text-to-video'
    || data.mode === 'image-to-video'
    || /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(String(data.mediaUrl || ''))
  const summary = isText ? data.text : data.prompt
  return (
    <div className={`canvas-node canvas-node-${data.preset} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="input" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="output" className="canvas-handle" />
      <div className="canvas-node-header">
        <span className="canvas-node-icon">{icons[data.preset]}</span>
        <span className="canvas-node-kind">{labels[data.preset] || '节点'}</span>
        {data.status && data.status !== 'idle' && <span className={`canvas-node-status status-${data.status}`}>{statusLabels[data.status]}</span>}
      </div>
      <div className="canvas-node-title">{data.title || data.label}</div>
      {data.mediaUrl ? (
        isVideo ? <video className="canvas-node-media" src={data.mediaUrl} muted preload="metadata" /> : <img className="canvas-node-media" src={data.mediaUrl} alt="" />
      ) : <div className="canvas-node-empty">{summary ? String(summary).slice(0, 112) : '选择节点后在右侧编辑'}</div>}
      {data.taskId && <div className="canvas-node-task">任务 {data.taskId.slice(0, 8)}…</div>}
    </div>
  )
}
