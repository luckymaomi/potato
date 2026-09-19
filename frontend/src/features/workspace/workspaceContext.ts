import { useOutletContext } from 'react-router-dom'
import type { Episode, Project } from '../../types/domain'

export interface ProjectWorkspaceContext {
  project: Project
  episode: Episode
  refreshProject: () => Promise<void>
}

export function useProjectWorkspace(): ProjectWorkspaceContext {
  return useOutletContext<ProjectWorkspaceContext>()
}
