import type { Edge } from '@xyflow/react'
import { projectsApi } from '../../api/projects'
import type { Project } from '../../types/domain'
import type { CanvasNode, CanvasNodeData, CanvasWorkspaceSnapshot, WorkflowGroup } from '../../store/workbenchStore'

export const DEMO_TEMPLATE_ID = 'agnes-short-drama-demo'
export const DEMO_VERSION = 4

function node(
  id: string,
  preset: CanvasNodeData['preset'],
  title: string,
  x: number,
  y: number,
  extra: Partial<CanvasNodeData> = {},
): CanvasNode {
  return {
    id,
    type: 'canvas',
    position: { x, y },
    data: { label: title, title, preset, status: 'idle', ...extra },
  }
}

function edge(source: string, target: string, index: number): Edge {
  return {
    id: `demo-edge-${index}`,
    source,
    target,
    type: 'bezier',
    animated: true,
    style: { stroke: '#7a8680', strokeWidth: 1.5 },
  }
}

export function createDemoWorkspace(project: Project): CanvasWorkspaceSnapshot {
  const episodeId = project.episodes?.[0]?.id
  const agnes = { provider: 'agnes' }
  const nodes: CanvasNode[] = [
    node('demo-outline', 'text', '故事梗概', 40, 180, {
      mode: 'manual',
      text: '创作一部约 20 秒的单场悬疑微短剧。记者林澈深夜来到雾港旧码头，收到一封无署名来信；远处红灯闪烁三次，她意识到失踪案的证人仍活着。人物不超过两人，分镜不超过三个，结尾保留悬念。',
    }),
    node('demo-script', 'text', 'Agnes 生成剧本', 350, 180, {
      ...agnes, mode: 'ai', apiAction: 'story', episodeId, text: '',
    }),
    node('demo-character-extract', 'text', 'Agnes 提取角色', 680, 20, {
      ...agnes, mode: 'ai', apiAction: 'characters', episodeId, text: '',
    }),
    node('demo-scene-extract', 'text', 'Agnes 提取场景', 680, 180, {
      ...agnes, mode: 'ai', apiAction: 'scenes', episodeId, text: '',
    }),
    node('demo-prop-extract', 'text', 'Agnes 提取道具', 680, 340, {
      ...agnes, mode: 'ai', apiAction: 'props', episodeId, text: '',
    }),
    node('demo-character', 'character', 'Agnes 角色参考图', 1010, 20, {
      ...agnes, mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    node('demo-scene', 'scene', 'Agnes 场景参考图', 1010, 180, {
      ...agnes, mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    node('demo-prop', 'prop', 'Agnes 道具参考图', 1010, 340, {
      ...agnes, mode: 'text-to-image', mediaKind: 'image', prompt: '',
    }),
    node('demo-storyboard', 'storyboard', 'Agnes 生成分镜', 1340, 180, {
      ...agnes, episodeId, prompt: '', mode: 'storyboard',
    }),
    node('demo-storyboard-image', 'storyboard', 'Agnes 生成分镜图', 1670, 120, {
      ...agnes, mode: 'image-to-image', mediaKind: 'image', prompt: '', referenceImages: [],
    }),
    node('demo-video', 'video', 'Agnes 生成分镜视频', 2000, 120, {
      ...agnes, mode: 'image-to-video', mediaKind: 'video', prompt: '', referenceImages: [], duration: 5,
    }),
  ]
  const connections: Array<[string, string]> = [
    ['demo-outline', 'demo-script'],
    ['demo-script', 'demo-character-extract'],
    ['demo-script', 'demo-scene-extract'],
    ['demo-script', 'demo-prop-extract'],
    ['demo-character-extract', 'demo-character'],
    ['demo-scene-extract', 'demo-scene'],
    ['demo-prop-extract', 'demo-prop'],
    ['demo-script', 'demo-storyboard'],
    ['demo-character', 'demo-storyboard-image'],
    ['demo-scene', 'demo-storyboard-image'],
    ['demo-prop', 'demo-storyboard-image'],
    ['demo-storyboard', 'demo-storyboard-image'],
    ['demo-storyboard-image', 'demo-video'],
  ]
  const edges = connections.map(([source, target], index) => edge(source, target, index))
  const workflow: WorkflowGroup = {
    id: 'demo-workflow',
    name: 'Agnes 完整短剧流程',
    nodeIds: nodes.map((item) => item.id),
    createdAt: new Date().toISOString(),
  }
  return {
    workspace_nodes: nodes,
    edges,
    workflow_groups: [workflow],
    template: { id: DEMO_TEMPLATE_ID, version: DEMO_VERSION },
  }
}

export async function createDemoProject() {
  const existing = await projectsApi.list({ page: 1, page_size: 200 })
  const currentDemo = existing.items.find((item) => item.metadata?.demo === true
    && item.metadata?.demo_provider === 'agnes'
    && item.metadata?.demo_version === DEMO_VERSION)
  if (currentDemo) return currentDemo.id

  const previousDemo = existing.items.find((item) => item.metadata?.demo === true && item.metadata?.demo_provider === 'agnes')
  const projectValues = {
    title: '《雾港来信》· Agnes Demo',
    description: '真实 Agnes 工作流模板：剧本、提取、资源图、分镜、分镜图和分镜视频均调用根配置中的 Agnes。',
    genre: '悬疑微短剧',
    style: 'cinematic',
    metadata: { ...(previousDemo?.metadata || {}), demo: true, demo_version: DEMO_VERSION, demo_provider: 'agnes' },
  }
  const project = previousDemo
    ? await projectsApi.update(previousDemo.id, projectValues)
    : await projectsApi.create(projectValues)
  const currentEpisode = previousDemo ? (await projectsApi.get(project.id)).episodes?.[0] : undefined
  await projectsApi.saveEpisodes(project.id, [{
    episode_number: 1,
    title: '第 1 集｜潮汐来信',
    duration: 20,
    script_content: currentEpisode?.script_content || '',
  }])
  const hydrated = await projectsApi.get(project.id)
  const workspace = createDemoWorkspace(hydrated)
  await projectsApi.saveCanvasLayout(project.id, workspace, workspace.workflow_groups)
  return project.id
}
