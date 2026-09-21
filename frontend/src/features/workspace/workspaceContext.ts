import { useOutletContext } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Episode, Project } from '../../types/domain'

export interface ProjectWorkspaceContext {
  project: Project
  episode: Episode
  refreshProject: () => Promise<void>
  setHeaderTools: (tools: ReactNode) => void
}

export function useProjectWorkspace(): ProjectWorkspaceContext {
  return useOutletContext<ProjectWorkspaceContext>()
}
