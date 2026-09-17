import type { Edge } from '@xyflow/react'
import type { Project } from '../../types/domain'
import type { CanvasNode, CanvasNodeData, CanvasWorkspaceSnapshot, WorkflowGroup } from '../../store/workbenchStore'

export const STARTER_TEMPLATE_ID = 'short-drama-starter'
export const STARTER_TEMPLATE_VERSION = 1

function starterNode(
  projectId: number,
  key: string,
  preset: CanvasNodeData['preset'],
  title: string,
  x: number,
  y: number,
  data: Partial<CanvasNodeData> = {},
): CanvasNode {
  return {
    id: `starter-${projectId}-${key}`,
    type: 'canvas',
    position: { x, y },
    data: { label: title, title, preset, status: 'idle', ...data },
  }
}

function starterEdge(projectId: number, source: string, target: string): Edge {
  return {
    id: `starter-edge-${projectId}-${source}-${target}`,
    source: `starter-${projectId}-${source}`,
    target: `starter-${projectId}-${target}`,
    type: 'bezier',
  }
}

export function createStarterWorkspace(project: Project): CanvasWorkspaceSnapshot {
  const episodeId = project.episodes?.[0]?.id
  const nodes: CanvasNode[] = [
    starterNode(project.id, 'script', 'text', '第 1 集剧本', 60, 220, {
      mode: 'manual',
      apiAction: 'story',
      episodeId,
      text: project.episodes?.[0]?.script_content || '',
    }),
    starterNode(project.id, 'characters-text', 'text', '提取角色', 390, 40, {
      mode: 'ai', apiAction: 'characters', episodeId, text: '',
    }),
    starterNode(project.id, 'scenes-text', 'text', '提取场景', 390, 220, {
      mode: 'ai', apiAction: 'scenes', episodeId, text: '',
    }),
    starterNode(project.id, 'props-text', 'text', '提取道具', 390, 400, {
      mode: 'ai', apiAction: 'props', episodeId, text: '',
    }),
    starterNode(project.id, 'character', 'character', '角色参考图', 720, 40, {
      mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    starterNode(project.id, 'scene', 'scene', '场景参考图', 720, 220, {
      mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    starterNode(project.id, 'prop', 'prop', '道具参考图', 720, 400, {
      mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    starterNode(project.id, 'storyboard', 'storyboard', '生成分镜', 1050, 220, {
      episodeId, prompt: '', mode: 'storyboard',
    }),
    starterNode(project.id, 'storyboard-image', 'image', '生成分镜图', 1380, 140, {
      mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    starterNode(project.id, 'storyboard-video', 'video', '生成分镜视频', 1710, 140, {
      mode: 'image-to-video', mediaKind: 'video', prompt: '', duration: 5,
    }),
  ]

  const edges = [
    starterEdge(project.id, 'script', 'characters-text'),
    starterEdge(project.id, 'script', 'scenes-text'),
    starterEdge(project.id, 'script', 'props-text'),
    starterEdge(project.id, 'script', 'storyboard'),
    starterEdge(project.id, 'characters-text', 'character'),
    starterEdge(project.id, 'scenes-text', 'scene'),
    starterEdge(project.id, 'props-text', 'prop'),
    starterEdge(project.id, 'character', 'storyboard-image'),
    starterEdge(project.id, 'scene', 'storyboard-image'),
    starterEdge(project.id, 'prop', 'storyboard-image'),
    starterEdge(project.id, 'storyboard', 'storyboard-image'),
    starterEdge(project.id, 'storyboard-image', 'storyboard-video'),
  ]
  const group: WorkflowGroup = {
    id: `starter-workflow-${project.id}`,
    name: '默认短剧工作流',
    nodeIds: nodes.map((node) => node.id),
    createdAt: new Date().toISOString(),
  }

  return {
    workspace_nodes: nodes,
    edges,
    workflow_groups: [group],
    template: { id: STARTER_TEMPLATE_ID, version: STARTER_TEMPLATE_VERSION },
  }
}
