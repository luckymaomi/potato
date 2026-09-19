import { ArrowLeftOutlined, BookOutlined, EnvironmentOutlined, PictureOutlined, PlayCircleOutlined, TeamOutlined, ToolOutlined } from '@ant-design/icons'
import { Alert, Button, Select, Spin, Tag } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi } from '../../api/projects'
import type { Project } from '../../types/domain'
import type { ProjectWorkspaceContext } from './workspaceContext'

const tabs = [
  { path: 'script', phase: '01', label: '总览与剧本', icon: <BookOutlined /> },
  { path: 'characters', phase: '02', label: '人物', icon: <TeamOutlined /> },
  { path: 'scenes', phase: '02', label: '场景', icon: <EnvironmentOutlined /> },
  { path: 'props', phase: '02', label: '道具', icon: <ToolOutlined /> },
  { path: 'storyboard', phase: '03', label: '分镜台', icon: <PictureOutlined /> },
  { path: 'produce', phase: '04', label: '生产', icon: <PlayCircleOutlined /> },
]

export function ProjectShell() {
  const projectId = Number(useParams().id)
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
      <header className="project-workspace-heading">
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} href="/">返回项目</Button>
          <h1>{project.title}</h1>
        </div>
        <label className="episode-picker">
          <span>剧集</span>
          <Select
            value={episode.id}
            options={(project.episodes ?? []).map((item) => ({ value: item.id, label: `${item.episode_number}. ${item.title}` }))}
            onChange={(value) => setSearchParams({ episode_id: String(value) })}
          />
        </label>
      </header>
      <nav className="project-workspace-tabs" aria-label="项目工作区">
        {tabs.map((tab) => <NavLink key={tab.path} to={`${tab.path}${query}`}><Tag bordered={false}>{tab.phase}</Tag><span className="workspace-tab-icon">{tab.icon}</span><strong>{tab.label}</strong></NavLink>)}
      </nav>
      <div className="project-workspace-body"><Outlet context={context} /></div>
    </section>
  )
}
