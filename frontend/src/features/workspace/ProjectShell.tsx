import { ArrowLeftOutlined, BookOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, MoonOutlined, PictureOutlined, SunOutlined } from '@ant-design/icons'
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Select, Space, Spin } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi } from '../../api/projects'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'
import type { Episode, Project } from '../../types/domain'
import type { ProjectWorkspaceContext } from './workspaceContext'
import { useTheme } from '../../theme/ThemeContext'

const tabs = [
  { path: 'script', label: '总览与剧本', icon: <BookOutlined /> },
  { path: 'assets', label: '资产图', icon: <FolderOpenOutlined /> },
  { path: 'panels', label: '分格台', icon: <PictureOutlined /> },
]

export function ProjectShell() {
  const { message, modal } = App.useApp()
  const { mode, toggle } = useTheme()
  const projectId = Number(useParams().id)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [project, setProject] = useState<Project>()
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [headerTools, setHeaderTools] = useState<ReactNode>(null)
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
    project && episode ? { project, episode, refreshProject, setHeaderTools } : undefined
  ), [episode, project, refreshProject])
  const canDeleteEpisode = (project?.episodes?.length ?? 0) > 1

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
      notifyAppSuccess(message, '已重命名话')
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
      notifyAppSuccess(message, '已删除话')
    } catch (reason) {
      notifyAppError({ message, modal }, reason)
    }
  }

  if (error) return <Alert type="error" showIcon message="项目工作区加载失败" description={error} />
  if (!context) return <div className="workspace-loading"><Spin size="large" /></div>

  return (
    <section className="project-workspace">
      <aside className="project-tabbar" aria-label="制作阶段">
        <div className="project-tabbar-header">
          <div className="project-tabbar-project">
            <strong title={project.title}>{project.title}</strong>
          </div>
        </div>
        <nav className="project-stage-nav">
          {tabs.map((tab) => (
            <NavLink key={tab.path} to={`${tab.path}${query}`} className="project-stage-link">
              <span className="project-stage-icon">{tab.icon}</span>
              <strong>{tab.label}</strong>
            </NavLink>
          ))}
        </nav>
        <Button
          className="project-theme-toggle"
          type="text"
          icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          aria-label={mode === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          title={mode === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          onClick={toggle}
        />
      </aside>
      <main className="project-workspace-main">
        <header className="project-workspace-heading">
          <div className="episode-picker-row">
            <label className="episode-picker">
              <span>当前话</span>
              <Select
                value={episode.id}
                options={(project.episodes ?? []).map((item) => ({
                  value: item.id,
                  label: item.title?.trim() || '未命名话',
                }))}
                onChange={(value) => setSearchParams({ episode_id: String(value) })}
              />
            </label>
            <Space size={4} wrap>
              <Button icon={<EditOutlined />} onClick={() => openRename(episode)}>重命名</Button>
              <Popconfirm
                title="删除这一话？"
                description="本话剧本与分格也会删除，且不可恢复。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={!canDeleteEpisode}
                onConfirm={() => void deleteEpisode()}
              >
                <Button danger icon={<DeleteOutlined />} disabled={!canDeleteEpisode}>删除</Button>
              </Popconfirm>
            </Space>
          </div>
          <div className="workspace-header-tools">
            {headerTools}
            <Button className="workspace-header-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回项目</Button>
          </div>
        </header>
        <div className="project-workspace-body"><Outlet context={context} /></div>
      </main>

      <Modal
        title="重命名话"
        open={renameOpen}
        confirmLoading={renaming}
        onOk={() => void saveRename()}
        onCancel={() => setRenameOpen(false)}
        okText="保存"
      >
        <Form form={renameForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="话名称" rules={[{ required: true, message: '请输入话名称' }, { whitespace: true, message: '请输入话名称' }]}>
            <Input autoFocus maxLength={80} placeholder="例如：雨夜开端" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
