import { DeleteOutlined, LinkOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Image, Input, message, Space, Typography, Upload } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { userErrorMessage } from '../../errors/appError'
import { mediaUrl } from '../../utils/mediaUrl'
import { addReferenceImage, removeReferenceImage } from './referenceImages'

interface ReferenceImageInputProps {
  value?: string[]
  onChange?: (value: string[]) => void
  uploading: boolean
  onUpload: (file: File) => Promise<string | undefined>
  maxCount?: number
}

export function ReferenceImageInput({
  value = [],
  onChange,
  uploading,
  onUpload,
  maxCount,
}: ReferenceImageInputProps) {
  const [urlDraft, setUrlDraft] = useState('')
  const valueRef = useRef(value)
  const uploadQueue = useRef(Promise.resolve())

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const commit = (next: string[]) => {
    valueRef.current = next
    onChange?.(next)
  }

  const addUrl = () => {
    try {
      const next = addReferenceImage(valueRef.current, urlDraft)
      assertWithinLimit(next, maxCount)
      commit(next)
      setUrlDraft('')
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const queueUpload = (file: File) => {
    uploadQueue.current = uploadQueue.current.then(async () => {
      if (maxCount !== undefined && valueRef.current.length >= maxCount) {
        message.error(`当前模型最多支持 ${maxCount} 张参考图`)
        return
      }
      const source = await onUpload(file)
      if (source) {
        const next = addReferenceImage(valueRef.current, source)
        assertWithinLimit(next, maxCount)
        commit(next)
      }
    })
    return false
  }

  return (
    <div className="reference-image-editor">
      <Space.Compact block>
        <Input
          prefix={<LinkOutlined />}
          value={urlDraft}
          placeholder="粘贴 http(s) 图片地址"
          onChange={(event) => setUrlDraft(event.target.value)}
          onPressEnter={(event) => {
            event.preventDefault()
            addUrl()
          }}
        />
        <Button disabled={maxCount !== undefined && value.length >= maxCount} onClick={addUrl}>添加 URL</Button>
      </Space.Compact>

      <div className="reference-image-upload-row">
        <Upload
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          showUploadList={false}
          beforeUpload={queueUpload}
          disabled={maxCount !== undefined && value.length >= maxCount}
        >
          <Button
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={maxCount !== undefined && value.length >= maxCount}
          >上传本地图片</Button>
        </Upload>
        <Typography.Text type="secondary">
          {maxCount === undefined ? '单张最多 16MB，可多选' : `最多 ${maxCount} 张，单张 16MB`}
        </Typography.Text>
      </div>

      {value.length ? (
        <Image.PreviewGroup>
          <div className="reference-image-grid">
            {value.map((source, index) => (
              <div className="reference-image-card" key={source}>
                <Image
                  src={mediaUrl(source)}
                  alt={`参考图 ${index + 1}`}
                  preview={{ mask: '预览' }}
                />
                <Button
                  className="reference-image-remove"
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={`删除参考图 ${index + 1}`}
                  onClick={() => commit(removeReferenceImage(valueRef.current, source))}
                />
              </div>
            ))}
          </div>
        </Image.PreviewGroup>
      ) : (
        <div className="reference-image-empty">添加后将在这里显示缩略图</div>
      )}
    </div>
  )
}

function assertWithinLimit(values: string[], maxCount: number | undefined): void {
  if (maxCount !== undefined && values.length > maxCount) {
    throw new Error(`当前模型最多支持 ${maxCount} 张参考图`)
  }
}
