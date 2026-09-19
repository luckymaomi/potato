import { RobotOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { productionApi } from '../../api/production'
import { waitForTask } from '../../api/tasks'
import { workspaceApi } from '../../api/workspace'
import { useProjectWorkspace } from './workspaceContext'

interface ScriptFormValues { overview?: string; script_content?: string }

export function ScriptWorkspace() {
  const { message } = App.useApp()
  const { project, episode, refreshProject } = useProjectWorkspace()
  const [form] = Form.useForm<ScriptFormValues>()
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
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
      message.success('总览与剧本已保存')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const generateScript = async () => {
    const values = form.getFieldsValue()
    setGenerating(true)
    try {
      const submission = await productionApi.execute({
        kind: 'ai-text',
        project_id: project.id,
        episode_id: episode.id,
        action: 'write-script',
        source_text: values.overview?.trim() || `为《${project.title}》创作本集剧本`,
      })
      if (submission.task_id) await waitForTask(submission.task_id)
      await refreshProject()
      message.success('剧本生成完成')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '剧本生成失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="workspace-column script-workspace">
      <div className="workspace-section-heading">
        <Typography.Title level={2}>总览与剧本</Typography.Title>
        <Space><Button icon={<RobotOutlined />} loading={generating} onClick={() => void generateScript()}>AI 生成剧本</Button><Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>保存</Button></Space>
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
