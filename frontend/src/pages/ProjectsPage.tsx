import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Empty, Form, Input, Modal, Popconfirm, Space, Spin, Tag, Tooltip, Upload } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { userErrorMessage } from '../errors/appError'
import { openRainyNightDemo } from '../features/workspace/demoProject'
import type { Episode, Project } from '../types/domain'

interface ProjectFormValues {
  title: string
  description?: string
  story_hook?: string
  worldview?: string
  storyline?: string
  tone?: string
  reference_setting?: string
  genre?: string
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ProjectsPage() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [creatingDemo, setCreatingDemo] = useState(false)
  const [creatingEpisodeId, setCreatingEpisodeId] = useState<number>()
  const [episodeEditor, setEpisodeEditor] = useState<{ project: Project; episode: Episode } | null>(null)
  const [episodeSaving, setEpisodeSaving] = useState(false)
  const [form] = Form.useForm<ProjectFormValues>()
  const [episodeForm] = Form.useForm<{ title: string }>()

  const loadProjects = useCallback(async (keyword?: string) => {
    try {
      const result = await projectsApi.list({ page: 1, page_size: 100, keyword: keyword?.trim() || undefined })
      setProjects(result.items)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    let active = true
    void projectsApi.list({ page: 1, page_size: 100 })
      .then((result) => {
        if (!active) return
        setProjects(result.items)
      })
      .catch((error: unknown) => { if (active) message.error(userErrorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [message])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (project: Project) => {
    setEditing(project)
    form.setFieldsValue({
      title: project.title,
      description: project.description || '',
      story_hook: project.story_hook || '',
      worldview: project.worldview || '',
      storyline: project.storyline || '',
      tone: project.tone || '',
      reference_setting: project.reference_setting || '',
      genre: project.genre || '',
    })
    setModalOpen(true)
  }

  const saveProject = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        const updated = await projectsApi.update(editing.id, values)
        setProjects((current) => current.map((project) => project.id === updated.id ? { ...project, ...updated, episodes: project.episodes } : project))
        message.success('项目信息已更新')
        setModalOpen(false)
        return
      }
      const project = await projectsApi.create({ ...values, style: 'realistic', metadata: { aspect_ratio: '9:16' } })
      message.success('短剧项目已创建')
      setModalOpen(false)
      form.resetFields()
      navigate(`/film/${project.id}/script`)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const removeProject = async (project: Project) => {
    try {
      await projectsApi.remove(project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
      message.success('项目已删除')
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const importProject = async (file: File) => {
    try {
      const project = await projectsApi.import(file)
      message.success('项目已导入')
      navigate(`/film/${project.id}/script`)
    } catch (error) {
      message.error(userErrorMessage(error))
    }
    return false
  }

  const exportProject = async (project: Project) => {
    try {
      const blob = await projectsApi.export(project.id)
      downloadBlob(blob, `${project.title || 'project'}.zip`)
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  const openDemo = async () => {
    setCreatingDemo(true)
    try {
      const id = await openRainyNightDemo()
      navigate(`/film/${id}/script`)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setCreatingDemo(false)
    }
  }

  const openEpisode = (project: Project, episode?: Episode) => {
    const query = episode ? `?episode_id=${episode.id}` : ''
    navigate(`/film/${project.id}/script${query}`)
  }

  const createEpisode = async (project: Project) => {
    setCreatingEpisodeId(project.id)
    try {
      const nextNumber = Math.max(0, ...(project.episodes ?? []).map((item) => item.episode_number)) + 1
      const result = await projectsApi.saveEpisodes(project.id, [{ episode_number: nextNumber, title: `第${nextNumber}集` }])
      const created = result.episodes.find((item) => item.episode_number === nextNumber)
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, episodes: result.episodes } : item))
      message.success(`已新建第${nextNumber}集`)
      if (created) openEpisode({ ...project, episodes: result.episodes }, created)
    } catch (error) {
      message.error(userErrorMessage(error))
    } finally {
      setCreatingEpisodeId(undefined)
    }
  }

  const openRenameEpisode = (project: Project, episode: Episode) => {
    setEpisodeEditor({ project, episode })
    episodeForm.setFieldsValue({ title: episode.title })
  }

  const saveEpisodeTitle = async () => {
    if (!episodeEditor) return
    try {
      const values = await episodeForm.validateFields()
      setEpisodeSaving(true)
      const updated = await projectsApi.updateEpisode(episodeEditor.project.id, episodeEditor.episode.id, { title: values.title.trim() })
      setProjects((current) => current.map((project) => {
        if (project.id !== episodeEditor.project.id) return project
        return {
          ...project,
          episodes: (project.episodes ?? []).map((episode) => episode.id === updated.id ? { ...episode, ...updated } : episode),
        }
      }))
      setEpisodeEditor(null)
      message.success('已重命名剧集')
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      message.error(userErrorMessage(error))
    } finally {
      setEpisodeSaving(false)
    }
  }

  const removeEpisode = async (project: Project, episode: Episode) => {
    try {
      await projectsApi.removeEpisode(project.id, episode.id)
      setProjects((current) => current.map((item) => {
        if (item.id !== project.id) return item
        return { ...item, episodes: (item.episodes ?? []).filter((row) => row.id !== episode.id) }
      }))
      message.success('已删除剧集')
    } catch (error) {
      message.error(userErrorMessage(error))
    }
  }

  return (
    <section className="projects-page">
      <header className="page-heading projects-heading">
        <div><h1>项目</h1><span className="projects-heading-count">{projects.length} 个项目</span></div>
        <Space wrap>
          <Upload accept=".zip" showUploadList={false} beforeUpload={importProject}>
            <Button icon={<ImportOutlined />}>导入项目</Button>
          </Upload>
          <Button icon={<PlayCircleOutlined />} loading={creatingDemo} onClick={() => void openDemo()}>打开示例</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button>
        </Space>
      </header>

      <div className="project-list-toolbar">
        <Input.Search
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索项目名称或说明"
          onSearch={(value) => { setLoading(true); void loadProjects(value) }}
        />
      </div>

      <div className="project-list-scroll">
        <Spin spinning={loading}>
          {projects.length ? (
            <div className="project-grid">
              {projects.map((project) => {
                const episodes = project.episodes?.length ? project.episodes : [{ id: 0, drama_id: project.id, episode_number: 1, title: '第1集' } as Episode]
                return (
                  <section
                    className="project-card"
                    key={project.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`打开${project.title}`}
                    onClick={(event) => {
                      const target = event.target as HTMLElement
                      if (target.closest('button,a,input,textarea,[role="button"]')) return
                      openEpisode(project, episodes[0].id ? episodes[0] : undefined)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      openEpisode(project, episodes[0].id ? episodes[0] : undefined)
                    }}
                  >
                    <div className="project-card-cover">
                      <VideoCameraOutlined />
                      {project.metadata?.demo === true ? <Tag bordered={false}>示例</Tag> : null}
                    </div>
                    <div className="project-card-body">
                      <div className="project-title-row">
                        <h2 className="project-title" title={project.title}>{project.title}</h2>
                        <span className="project-card-count">{episodes.length} 集</span>
                      </div>
                      <p className="project-card-hook">{project.story_hook || '还没有填写核心钩子'}</p>
                      <div className="project-meta">
                        <span>{project.genre || '未分类'}</span>
                        <span>{project.updated_at ? new Date(project.updated_at).toLocaleDateString('zh-CN') : '尚未更新'}</span>
                      </div>
                      <div className="project-card-episodes">
                        {episodes.slice(0, 3).map((episode) => (
                          <div className="project-card-episode" key={`${project.id}-${episode.id || episode.episode_number}`}>
                            <button type="button" className="project-card-episode-open" onClick={() => openEpisode(project, episode.id ? episode : undefined)}>
                              <span>第{episode.episode_number}集</span>
                              <strong>{episode.title || `第${episode.episode_number}集`}</strong>
                              <FileTextOutlined />
                            </button>
                            {episode.id ? <span className="project-card-episode-actions">
                              <Tooltip title="重命名"><Button type="text" size="small" icon={<EditOutlined />} aria-label="重命名剧集" onClick={() => openRenameEpisode(project, episode)} /></Tooltip>
                              <Popconfirm
                                title="删除这一集？"
                                description="本集剧本与分镜也会删除。"
                                okText="删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                                disabled={(project.episodes?.length ?? 0) <= 1}
                                onConfirm={() => void removeEpisode(project, episode)}
                              >
                                <Tooltip title={(project.episodes?.length ?? 0) <= 1 ? '至少保留一集' : '删除'}><Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除剧集" disabled={(project.episodes?.length ?? 0) <= 1} /></Tooltip>
                              </Popconfirm>
                            </span> : null}
                          </div>
                        ))}
                        {episodes.length > 3 ? <span className="project-card-more">还有 {episodes.length - 3} 集</span> : null}
                      </div>
                      <div className="project-card-actions">
                        <Button type="primary" icon={<FileTextOutlined />} onClick={() => openEpisode(project, episodes[0].id ? episodes[0] : undefined)}>打开总览</Button>
                        <Button icon={<PlusOutlined />} loading={creatingEpisodeId === project.id} onClick={() => void createEpisode(project)}>新建集</Button>
                      </div>
                      <div className="project-card-secondary-actions">
                        <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} aria-label="编辑项目" onClick={() => openEdit(project)} /></Tooltip>
                        <Tooltip title="导出"><Button type="text" icon={<DownloadOutlined />} aria-label="导出项目" onClick={() => void exportProject(project)} /></Tooltip>
                        <Popconfirm
                          title="删除项目"
                          description={`确定删除“${project.title}”及其全部项目数据吗？`}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => void removeProject(project)}
                        >
                          <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />} aria-label="删除项目" /></Tooltip>
                        </Popconfirm>
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          ) : !loading ? (
            <div className="empty-band">
              <Empty description="没有找到项目">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建第一个项目</Button>
              </Empty>
            </div>
          ) : null}
        </Spin>
      </div>

      <Modal
        title={editing ? '编辑项目' : '新建项目'}
        open={modalOpen}
        confirmLoading={saving}
        onOk={() => void saveProject()}
        onCancel={() => setModalOpen(false)}
        okText={editing ? '保存修改' : '创建并打开'}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input autoFocus maxLength={80} />
          </Form.Item>
          <Form.Item name="genre" label="类型"><Input placeholder="悬疑、都市、科幻…" maxLength={40} /></Form.Item>
          <Form.Item name="story_hook" label="核心钩子"><Input.TextArea rows={2} maxLength={300} /></Form.Item>
          <Form.Item name="worldview" label="世界观"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
          <Form.Item name="storyline" label="主线"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
          <Form.Item name="tone" label="基调"><Input maxLength={80} /></Form.Item>
          <Form.Item name="reference_setting" label="参考设定"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={episodeEditor ? `重命名第${episodeEditor.episode.episode_number}集` : '重命名剧集'}
        open={Boolean(episodeEditor)}
        confirmLoading={episodeSaving}
        onOk={() => void saveEpisodeTitle()}
        onCancel={() => setEpisodeEditor(null)}
        okText="保存"
      >
        <Form form={episodeForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="剧集名称" rules={[{ required: true, message: '请输入剧集名称' }, { whitespace: true, message: '请输入剧集名称' }]}>
            <Input autoFocus maxLength={80} placeholder="例如：雨夜开端" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
