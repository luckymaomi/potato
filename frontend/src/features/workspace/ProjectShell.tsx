import { AppstoreOutlined, ArrowLeftOutlined, BookOutlined, FolderOpenOutlined, PictureOutlined, PlayCircleOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Button, Select, Spin } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi } from '../../api/projects'
import type { Project } from '../../types/domain'
import type { ProjectWorkspaceContext } from './workspaceContext'

const tabs = [
  { path: 'script', phase: '01', label: '总览与剧本', icon: <BookOutlined />, hint: '故事、剧本' },
  { path: 'assets', phase: '02', label: '资产图', icon: <FolderOpenOutlined />, hint: '人物、场景、道具' },
  { path: 'storyboard', phase: '03', label: '分镜台', icon: <PictureOutlined />, hint: '按镜头编排' },
  { path: 'produce', phase: '04', label: '生产', icon: <PlayCircleOutlined />, hint: '出图、出视频、合成' },
]

export function ProjectShell() {
  const projectId = Number(useParams().id)
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [project, setProject] = useState<Project>()
  const [error, setError] = useState('')

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

  if (error) return <Alert type="error" showIcon message="项目工作区加载失败" description={error} />
  if (!context) return <div className="workspace-loading"><Spin size="large" /></div>

  return (
    <section className="project-workspace">
      <aside className="project-tabbar" aria-label="制作阶段">
        <div className="project-tabbar-brand"><AppstoreOutlined /></div>
        <Button className="project-tabbar-back" type="text" icon={<ArrowLeftOutlined />} href="/" aria-label="返回项目" />
        <nav className="project-stage-nav">
          {tabs.map((tab) => <NavLink key={tab.path} to={`${tab.path}${query}`} className="project-stage-link">
            <span className="project-stage-icon">{tab.icon}</span>
            <span className="project-stage-phase">{tab.phase}</span>
            <strong>{tab.label}</strong>
          </NavLink>)}
        </nav>
        <div className="project-tabbar-foot"><span className="project-tabbar-dot" /><span>本地项目</span></div>
      </aside>
      <main className="project-workspace-main">
        <header className="project-workspace-heading">
          <div className="project-breadcrumb"><strong>{project.title}</strong><RightOutlined /><span>{tabs.find((tab) => location.pathname.endsWith(`/${tab.path}`))?.label ?? '总览与剧本'}</span></div>
          <label className="episode-picker">
            <span>当前剧集</span>
            <Select
              value={episode.id}
              options={(project.episodes ?? []).map((item) => ({ value: item.id, label: `${item.episode_number}. ${item.title}` }))}
              onChange={(value) => setSearchParams({ episode_id: String(value) })}
            />
          </label>
        </header>
        <div className="project-workspace-body"><Outlet context={context} /></div>
      </main>
    </section>
  )
}
