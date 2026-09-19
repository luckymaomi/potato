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
    <div className="workspace-column">
      <div className="workspace-section-heading">
        <div><Typography.Title level={2}>总览与剧本</Typography.Title><Typography.Text type="secondary">总览讲清全剧，剧本讲清这一集如何演。</Typography.Text></div>
        <Space><Button icon={<RobotOutlined />} loading={generating} onClick={() => void generateScript()}>AI 生成剧本</Button><Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>保存</Button></Space>
      </div>
      <Form form={form} layout="vertical" className="script-workspace-grid">
        <Card title="故事总览" extra={<Typography.Text type="secondary">项目级</Typography.Text>}>
          <Form.Item name="overview" label="这部作品讲什么">
            <Input.TextArea autoSize={{ minRows: 12, maxRows: 24 }} placeholder="主要人物、核心冲突、世界观与整体风格。可以留空后再补。" />
          </Form.Item>
        </Card>
        <Card title={episode.title} extra={<Typography.Text type="secondary">本集文本</Typography.Text>}>
          <Form.Item name="script_content" label="分场剧本">
            <Input.TextArea autoSize={{ minRows: 18, maxRows: 34 }} placeholder="场次、动作、对白……可以手写，也可以从总览生成。" />
          </Form.Item>
        </Card>
      </Form>
    </div>
  )
}
