import { SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { useProjectWorkspace } from './workspaceContext'

interface ScriptFormValues { overview?: string; script_content?: string }

export function ScriptWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode, refreshProject } = useProjectWorkspace()
  const [form] = Form.useForm<ScriptFormValues>()
  const [saving, setSaving] = useState(false)
  const overview = Form.useWatch('overview', form) ?? ''
  const scriptContent = Form.useWatch('script_content', form) ?? ''

  useEffect(() => {
    form.setFieldsValue({ overview: project.description ?? '', script_content: episode.script_content ?? '' })
  }, [episode.id, episode.script_content, form, project.description])

  const save = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      await workspaceApi.saveScript(project.id, {
        episode_id: episode.id,
        overview: values.overview ?? '',
        script_content: values.script_content ?? '',
      })
      await refreshProject()
      notifyAppSuccess(message, '总览与剧本已保存')
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
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>保存</Button>
        </Space>
      </div>
      <Form form={form} layout="vertical" className="script-workspace-grid">
        <Card title="故事总览" extra={<span className="script-editor-count">{overview.length} 字</span>}>
          <Form.Item name="overview" className="script-editor-field">
            <Input.TextArea aria-label="故事总览" placeholder="主要人物、核心冲突、世界观与整体风格。" />
          </Form.Item>
        </Card>
        <Card title={episode.title} extra={<span className="script-editor-count">{scriptContent.length} 字</span>}>
          <Form.Item name="script_content" className="script-editor-field">
            <Input.TextArea aria-label="本集剧本" placeholder="写下场次、动作和对白，也可以从故事总览生成。" />
          </Form.Item>
        </Card>
      </Form>
    </div>
  )
}
