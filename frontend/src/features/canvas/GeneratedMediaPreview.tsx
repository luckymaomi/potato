import { ExportOutlined } from '@ant-design/icons'
import { Image, Typography } from 'antd'
import type { ProductionNodeData } from '../production/catalog'
import { mediaUrl } from '../../utils/mediaUrl'
import { isVideoMedia } from './mediaPresentation'

interface GeneratedMediaPreviewProps {
  data: ProductionNodeData
}

export function GeneratedMediaPreview({ data }: GeneratedMediaPreviewProps) {
  const source = mediaUrl(data.result.outputUrl)
  if (!source) return null
  const isVideo = isVideoMedia(data)

  return (
    <section className="generated-media-preview" aria-label="当前生成结果">
      <div className="generated-media-preview-heading">
        <Typography.Text strong>当前生成结果</Typography.Text>
        <Typography.Link href={source} target="_blank" rel="noreferrer">
          <ExportOutlined /> 新窗口打开
        </Typography.Link>
      </div>
      {isVideo ? (
        <video className="generated-media-preview-video" src={source} controls preload="metadata">
          当前浏览器不支持视频预览。
        </video>
      ) : (
        <Image
          className="generated-media-preview-image"
          src={source}
          alt={`${data.title || '节点'}生成结果`}
          preview={{ mask: '查看大图' }}
        />
      )}
    </section>
  )
}
