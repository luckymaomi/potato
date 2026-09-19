import { BookOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, PictureOutlined, PlayCircleOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Select, Space, Spin } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi } from '../../api/projects'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import type { Episode, Project } from '../../types/domain'
import type { ProjectWorkspaceContext } from './workspaceContext'

const tabs = [
  { path: 'script', label: '总览与剧本', icon: <BookOutlined /> },
  { path: 'assets', label: '资产图', icon: <FolderOpenOutlined /> },
  { path: 'storyboard', label: '分镜台', icon: <PictureOutlined /> },
  { path: 'produce', label: '生产', icon: <PlayCircleOutlined /> },
]

export function ProjectShell() {
  const { message, modal } = App.useApp()
  const projectId = Number(useParams().id)
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [project, setProject] = useState<Project>()
  const [error, setError] = useState('')
  const [creatingEpisode, setCreatingEpisode] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameForm] = Form.useForm<{ title: string }>()

  const refreshProject = useCallback(async () => {
    try {
      setProject(await projectsApi.get(projectId))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目加载失败')
    }
  }, [projectId])

  useEffect(() => { void refreshProject() }, [refreshProject])

  const requestedEpisode = Number(searchParams.get('episode_id'))
  const episode = project?.episodes?.find((item) => item.id === requestedEpisode) ?? project?.episodes?.[0]
  const query = episode ? `?episode_id=${episode.id}` : ''
  const context = useMemo<ProjectWorkspaceContext | undefined>(() => (
    project && episode ? { project, episode, refreshProject } : undefined
  ), [episode, project, refreshProject])
  const canDeleteEpisode = (project?.episodes?.length ?? 0) > 1

  const createEpisode = async () => {
    if (!project) return
    setCreatingEpisode(true)
    try {
      const nextNumber = Math.max(0, ...(project.episodes ?? []).map((item) => item.episode_number)) + 1
      const result = await projectsApi.saveEpisodes(project.id, [{ episode_number: nextNumber, title: `第${nextNumber}集` }])
      const created = result.episodes.find((item) => item.episode_number === nextNumber)
      await refreshProject()
      if (created) setSearchParams({ episode_id: String(created.id) })
      notifyAppSuccess(message, `已新建第${nextNumber}集`)
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    } finally {
      setCreatingEpisode(false)
    }
  }

  const openRename = (target: Episode) => {
    renameForm.setFieldsValue({ title: target.title })
    setRenameOpen(true)
  }

  const saveRename = async () => {
    if (!project || !episode) return
    try {
      const values = await renameForm.validateFields()
      setRenaming(true)
      await projectsApi.updateEpisode(project.id, episode.id, { title: values.title.trim() })
      await refreshProject()
      setRenameOpen(false)
      notifyAppSuccess(message, '已重命名剧集')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'errorFields' in reason) return
      notifyAppError({ message, modal }, reason)
    } finally {
      setRenaming(false)
    }
  }

  const deleteEpisode = async () => {
    if (!project || !episode) return
    try {
      await projectsApi.removeEpisode(project.id, episode.id)
      const refreshed = await projectsApi.get(project.id)
      setProject(refreshed)
      const next = refreshed.episodes?.[0]
      if (next) setSearchParams({ episode_id: String(next.id) })
      notifyAppSuccess(message, '已删除剧集')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  if (error) return <Alert type="error" showIcon message="项目工作区加载失败" description={error} />
  if (!context) return <div className="workspace-loading"><Spin size="large" /></div>

  return (
    <section className="project-workspace">
      <aside className="project-tabbar" aria-label="制作阶段">
        <nav className="project-stage-nav">
          {tabs.map((tab) => (
            <NavLink key={tab.path} to={`${tab.path}${query}`} className="project-stage-link">
              <span className="project-stage-icon">{tab.icon}</span>
              <strong>{tab.label}</strong>
            </NavLink>
          ))}
        </nav>
        <Button className="project-tabbar-foot" type="text" onClick={() => navigate('/')}>返回</Button>
      </aside>
      <main className="project-workspace-main">
        <header className="project-workspace-heading">
          <div className="project-breadcrumb">
            <Link to="/">项目</Link>
            <RightOutlined />
            <strong>{project.title}</strong>
            <RightOutlined />
            <span>{tabs.find((tab) => location.pathname.endsWith(`/${tab.path}`))?.label ?? '总览与剧本'}</span>
          </div>
          <div className="episode-picker-row">
            <label className="episode-picker">
              <span>当前剧集</span>
              <Select
                value={episode.id}
                options={(project.episodes ?? []).map((item) => ({ value: item.id, label: `第${item.episode_number}集 · ${item.title}` }))}
                onChange={(value) => setSearchParams({ episode_id: String(value) })}
              />
            </label>
            <Space size={4}>
              <Button icon={<EditOutlined />} onClick={() => openRename(episode)}>重命名</Button>
              <Popconfirm
                title="删除这一集？"
                description="本集剧本与分镜也会删除，且不可恢复。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={!canDeleteEpisode}
                onConfirm={() => void deleteEpisode()}
              >
                <Button danger icon={<DeleteOutlined />} disabled={!canDeleteEpisode}>删除</Button>
              </Popconfirm>
              <Button icon={<PlusOutlined />} loading={creatingEpisode} onClick={() => void createEpisode()}>新建集</Button>
            </Space>
          </div>
        </header>
        <div className="project-workspace-body"><Outlet context={context} /></div>
      </main>

      <Modal
        title={`重命名第${episode.episode_number}集`}
        open={renameOpen}
        confirmLoading={renaming}
        onOk={() => void saveRename()}
        onCancel={() => setRenameOpen(false)}
        okText="保存"
      >
        <Form form={renameForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="剧集名称" rules={[{ required: true, message: '请输入剧集名称' }, { whitespace: true, message: '请输入剧集名称' }]}>
            <Input autoFocus maxLength={80} placeholder="例如：雨夜开端" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
