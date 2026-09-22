import { BuildOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { workspaceApi, type EpisodeStoryPlan, type ScriptSceneDraft, type StoryOverview } from '../../api/workspace'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import { useProjectWorkspace } from './workspaceContext'

interface ScriptFormValues extends StoryOverview, EpisodeStoryPlan { script_content: string }
function parseScenes(script: string): ScriptSceneDraft[] {
  const lines = script.split(/\r?\n/)
  const scenes: ScriptSceneDraft[] = []
  let current: ScriptSceneDraft | undefined
  for (const line of lines) {
    const value = line.trim()
    if (/^第\s*(?:\d+|[一二三四五六七八九十百]+)\s*场(?:\s*[：:]?.*)?$/.test(value)) {
      if (current) scenes.push(current)
      current = { title: value, content: '' }
      continue
    }
    if (current) current.content = current.content ? `${current.content}\n${line}` : line
  }
  if (current) scenes.push(current)
  if (scenes.length) return scenes.map((scene) => ({ ...scene, content: scene.content.trim() }))
  return [{ title: '第一场', content: script.trim() }]
}

const overviewFields: Array<{ name: keyof StoryOverview; label: string; placeholder: string }> = [
  { name: 'story_hook', label: '核心钩子', placeholder: '一句话写清观众为什么要继续看。' },
  { name: 'worldview', label: '世界观', placeholder: '时代、规则、空间和故事成立的背景。' },
  { name: 'storyline', label: '主线', placeholder: '主人公要完成什么，阻力从哪里来。' },
  { name: 'tone', label: '基调', placeholder: '例如冷峻、轻快、悬疑或温暖。' },
  { name: 'reference_setting', label: '参考设定', placeholder: '已有素材、参考作品或必须保留的设定。' },
]

const planFields: Array<{ name: keyof EpisodeStoryPlan; label: string; placeholder: string }> = [
  { name: 'episode_goal', label: '本话目标', placeholder: '这一话结束时，故事要推进到哪里。' },
  { name: 'conflict', label: '主要冲突', placeholder: '本话最重要的对抗或阻碍。' },
  { name: 'turning_point', label: '转折', placeholder: '哪一个事件改变了局面。' },
  { name: 'ending_hook', label: '结尾钩子', placeholder: '结尾留下的悬念、问题或下一话动力。' },
  { name: 'scene_notes', label: '场次与节拍', placeholder: '按场次写地点、动作、对白和情绪节拍。' },
]

export function ScriptWorkspace() {
  const { message, modal } = App.useApp()
  const { project, episode, refreshProject } = useProjectWorkspace()
  const [form] = Form.useForm<ScriptFormValues>()
  const [saving, setSaving] = useState(false)
  const [scenes, setScenes] = useState<ScriptSceneDraft[]>(() => parseScenes(episode.script_content ?? ''))
  const [assembling, setAssembling] = useState(false)
  const values = Form.useWatch([], form) as Partial<ScriptFormValues> | undefined

  useEffect(() => {
    form.setFieldsValue({
      story_hook: project.story_hook ?? '', worldview: project.worldview ?? '', storyline: project.storyline ?? '', tone: project.tone ?? '', reference_setting: project.reference_setting ?? '',
      episode_goal: episode.episode_goal ?? '', conflict: episode.conflict ?? '', turning_point: episode.turning_point ?? '', ending_hook: episode.ending_hook ?? '', scene_notes: episode.scene_notes ?? '',
      script_content: episode.script_content ?? '',
    })
    setScenes(parseScenes(episode.script_content ?? ''))
  }, [episode.id, episode.script_content, episode.episode_goal, episode.conflict, episode.turning_point, episode.ending_hook, episode.scene_notes, form, project.story_hook, project.worldview, project.storyline, project.tone, project.reference_setting])

  const updateScene = (index: number, patch: Partial<ScriptSceneDraft>) => {
    setScenes((current) => current.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, ...patch } : scene))
  }

  const addScene = () => {
    setScenes((current) => [...current, { title: `第${current.length + 1}场`, content: '' }])
  }

  const removeScene = (index: number) => {
    setScenes((current) => current.length > 1 ? current.filter((_, sceneIndex) => sceneIndex !== index) : current)
  }

  const assembleScript = async () => {
    setAssembling(true)
    try {
      const result = await workspaceApi.assembleScript(project.id, { episode_id: episode.id, scenes })
      form.setFieldValue('script_content', result.script_content)
      notifyAppSuccess(message, '已按场次组装剧本')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setAssembling(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const current = await form.validateFields()
      await workspaceApi.saveScript(project.id, {
        episode_id: episode.id,
        overview: { story_hook: current.story_hook ?? '', worldview: current.worldview ?? '', storyline: current.storyline ?? '', tone: current.tone ?? '', reference_setting: current.reference_setting ?? '' },
        episode_plan: { episode_goal: current.episode_goal ?? '', conflict: current.conflict ?? '', turning_point: current.turning_point ?? '', ending_hook: current.ending_hook ?? '', scene_notes: current.scene_notes ?? '' },
        script_content: current.script_content ?? '',
      })
      await refreshProject()
      notifyAppSuccess(message, '总览与剧本已保存')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'errorFields' in reason) return
      notifyAppError({ message, modal }, reason)
    } finally { setSaving(false) }
  }

  return (
    <div className="workspace-column script-workspace">
      <div className="workspace-section-heading">
        <Typography.Title level={2}>总览与剧本</Typography.Title>
        <Space wrap><Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>保存</Button></Space>
      </div>
      <Form form={form} layout="vertical" className="script-workspace-form">
        <Card title="故事总览" className="script-section-card">
          <div className="script-field-grid">{overviewFields.map((field) => (
            <Form.Item key={field.name} name={field.name} label={field.label}><Input.TextArea aria-label={field.label} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={field.placeholder} /></Form.Item>
          ))}</div>
        </Card>
        <Card title="本话结构" className="script-section-card">
          <div className="script-field-grid">{planFields.map((field) => (
            <Form.Item key={field.name} name={field.name} label={field.label}><Input.TextArea aria-label={field.label} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={field.placeholder} /></Form.Item>
          ))}</div>
        </Card>
        <Card title={episode.title} extra={<span className="script-editor-count">{values?.script_content?.length ?? 0} 字</span>} className="script-section-card script-content-card">
          <div className="script-scene-toolbar">
            <span>按场次填写，再组装成本话剧本。</span>
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={addScene}>新增场次</Button>
              <Button type="primary" icon={<BuildOutlined />} loading={assembling} onClick={() => void assembleScript()}>组装剧本</Button>
            </Space>
          </div>
          <div className="script-scene-list">
            {scenes.map((scene, index) => (
              <div className="script-scene-item" key={`${episode.id}-${index}`}>
                <div className="script-scene-item-heading">
                  <Input value={scene.title} aria-label={`第${index + 1}场标题`} onChange={(event) => updateScene(index, { title: event.target.value })} placeholder={`第${index + 1}场`} />
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除第${index + 1}场`} disabled={scenes.length <= 1} onClick={() => removeScene(index)} />
                </div>
                <Input.TextArea value={scene.content} aria-label={`第${index + 1}场内容`} onChange={(event) => updateScene(index, { content: event.target.value })} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="地点、动作、对白和情绪节拍。" />
              </div>
            ))}
          </div>
          <Form.Item name="script_content" label="本话剧本" className="script-content-field"><Input.TextArea aria-label="本话剧本" placeholder="按场次写下动作、对白和情绪。" /></Form.Item>
        </Card>
      </Form>
    </div>
  )
}
