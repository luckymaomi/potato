import { SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { useProjectWorkspace } from './workspaceContext'

interface ScriptFormValues {
  tone: string
  reference_setting: string
  script_content: string
}

export function ScriptWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode, refreshProject } = useProjectWorkspace()
  const [form] = Form.useForm<ScriptFormValues>()
  const [saving, setSaving] = useState(false)
  const values = Form.useWatch([], form) as Partial<ScriptFormValues> | undefined

  useEffect(() => {
    form.setFieldsValue({
      tone: project.tone ?? '',
      reference_setting: project.reference_setting ?? '',
      script_content: episode.script_content ?? '',
    })
  }, [episode.id, episode.script_content, form, project.tone, project.reference_setting])

  const save = async () => {
    setSaving(true)
    try {
      const current = await form.validateFields()
      await workspaceApi.saveScript(project.id, {
        episode_id: episode.id,
        overview: {
          story_hook: '',
          worldview: '',
          storyline: '',
          tone: current.tone ?? '',
          reference_setting: current.reference_setting ?? '',
        },
        episode_plan: {
          episode_goal: '',
          conflict: '',
          turning_point: '',
          ending_hook: '',
          scene_notes: '',
        },
        script_content: current.script_content ?? '',
      })
      await refreshProject()
      notifyAppSuccess(message, '故事与剧本已保存')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'errorFields' in reason) return
      notifyAppError({ message, modal }, reason)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="workspace-column script-workspace">
      <div className="workspace-section-heading">
        <Typography.Title level={2}>总览与剧本</Typography.Title>
        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </Space>
      </div>
      <Form form={form} layout="vertical" className="script-workspace-form">
        <Card title="画风锁" className="script-section-card">
          <Typography.Paragraph type="secondary">
            项目级基调与参考设定。分格台组装图片配方时会注入，不按格重写。
          </Typography.Paragraph>
          <div className="script-field-grid">
            <Form.Item name="tone" label="基调">
              <Input.TextArea
                aria-label="基调"
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="例如明亮庄严、冷峻悬疑、轻快日常。"
              />
            </Form.Item>
            <Form.Item name="reference_setting" label="参考设定">
              <Input.TextArea
                aria-label="参考设定"
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="写实电影感、线稿漫、色调或必须保留的视觉设定。"
              />
            </Form.Item>
          </div>
        </Card>
        <Card
          title="故事与剧本"
          extra={<span className="script-editor-count">{values?.script_content?.length ?? 0} 字</span>}
          className="script-section-card script-content-card"
        >
          <Typography.Paragraph type="secondary">
            故事源与本话剧本合在一处。与分格台彻底分离：不建镜头、不自动建格。
          </Typography.Paragraph>
          <Form.Item name="script_content" className="script-content-field">
            <Input.TextArea
              aria-label="故事与剧本"
              autoSize={{ minRows: 16, maxRows: 40 }}
              placeholder="写下这一话要讲的故事与剧本文本。"
            />
          </Form.Item>
        </Card>
      </Form>
    </div>
  )
}
