import { SaveOutlined } from '@ant-design/icons'
import { App, Card, Form, Input, Typography } from 'antd'
import { useCallback, useEffect, useRef } from 'react'
import { workspaceApi } from '../../api/workspace'
import { notifyAppError } from '../../errors/appError'
import { useProjectWorkspace } from './workspaceContext'
import { autoSaveLabel, useDebouncedAutoSave } from './useDebouncedAutoSave'

interface ScriptFormValues {
  tone: string
  reference_setting: string
  script_content: string
}

export function ScriptWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode, refreshProject } = useProjectWorkspace()
  const [form] = Form.useForm<ScriptFormValues>()
  const values = Form.useWatch([], form) as Partial<ScriptFormValues> | undefined
  const hydrating = useRef(true)
  const contextRef = useRef({ projectId: project.id, episodeId: episode.id })
  const flushRef = useRef<() => Promise<void>>(async () => undefined)

  const persist = useCallback(async () => {
    try {
      const current = await form.validateFields()
      const { projectId, episodeId } = contextRef.current
      await workspaceApi.saveScript(projectId, {
        episode_id: episodeId,
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
      if (
        contextRef.current.projectId === projectId
        && contextRef.current.episodeId === episodeId
      ) {
        await refreshProject()
      }
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'errorFields' in reason) throw reason
      notifyAppError({ message, modal }, reason)
      throw reason
    }
  }, [form, message, modal, refreshProject])

  const { status, schedule, flush, reset } = useDebouncedAutoSave(persist)
  flushRef.current = flush

  useEffect(() => {
    let alive = true
    void flushRef.current()
      .catch(() => undefined)
      .finally(() => {
        if (!alive) return
        contextRef.current = { projectId: project.id, episodeId: episode.id }
        hydrating.current = true
        reset()
        form.setFieldsValue({
          tone: project.tone ?? '',
          reference_setting: project.reference_setting ?? '',
          script_content: episode.script_content ?? '',
        })
        hydrating.current = false
      })
    return () => {
      alive = false
    }
    // 只在切换项目/话时回填；自动保存后的 refresh 不得冲掉正在编辑的草稿。
  }, [episode.id, form, project.id, reset])

  useEffect(() => () => {
    void flushRef.current().catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void flush().catch(() => undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flush])

  return (
    <div className="workspace-column script-workspace">
      <div className="workspace-section-heading">
        <Typography.Title level={2}>总览与剧本</Typography.Title>
        <span className={`auto-save-hint is-${status}`} aria-live="polite">
          <SaveOutlined style={{ marginRight: 6 }} />
          {autoSaveLabel(status)}
        </span>
      </div>
      <Form
        form={form}
        layout="vertical"
        className="script-workspace-form"
        onValuesChange={() => {
          if (hydrating.current) return
          schedule()
        }}
      >
        <Card title="画风锁" className="script-section-card">
          <Typography.Paragraph type="secondary">
            项目级基调与参考设定。分镜台组装图片配方时会注入，不按镜重写。编辑后约 2 秒自动保存。
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
            故事源与本话剧本合在一处。与分镜台彻底分离：不建镜头、不自动建镜。
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
