import type { Project } from '../../types/domain'
import type { CanvasWorkspaceSnapshot } from '../canvas/canvasTypes'
import type { ProductionNodeSpec } from './workspace'
import { createProductionWorkspace } from './workspace'

export const STARTER_TEMPLATE_ID = 'short-drama-production'
export const STARTER_TEMPLATE_VERSION = 3

export function createStarterWorkspace(project: Project): CanvasWorkspaceSnapshot {
  const prefix = `starter-${project.id}`
  const nodeId = (name: string) => `${prefix}-${name}`
  const episodeId = project.episodes?.[0]?.id
  const aspectRatio = project.metadata?.aspect_ratio || '9:16'
  const nodes: ProductionNodeSpec[] = [
    { id: nodeId('story'), role: 'story', x: 40, y: 250, data: { title: '故事想法', textMode: 'manual', text: project.description || '' } },
    { id: nodeId('script'), role: 'script', x: 350, y: 250, data: { title: '第 1 集剧本', episodeId, text: project.episodes?.[0]?.script_content || '' } },
    { id: nodeId('characters'), role: 'character-extraction', x: 680, y: 20, data: { episodeId } },
    { id: nodeId('scenes'), role: 'scene-extraction', x: 680, y: 250, data: { episodeId } },
    { id: nodeId('props'), role: 'prop-extraction', x: 680, y: 480, data: { episodeId } },
    { id: nodeId('character-asset'), role: 'character-asset', x: 1010, y: 20, data: { aspectRatio } },
    { id: nodeId('scene-asset'), role: 'scene-asset', x: 1010, y: 250, data: { aspectRatio } },
    { id: nodeId('prop-asset'), role: 'prop-asset', x: 1010, y: 480, data: { aspectRatio } },
    { id: nodeId('storyboards'), role: 'storyboard-plan', x: 1340, y: 250, data: { episodeId, storyboardCount: 3 } },
    { id: nodeId('storyboard-image'), role: 'storyboard-image', x: 1670, y: 180, data: { aspectRatio } },
    { id: nodeId('shot-video'), role: 'shot-video', x: 2000, y: 180, data: { aspectRatio, duration: 5 } },
  ]
  const connections: Array<[string, string]> = [
    ['story', 'script'], ['script', 'characters'], ['script', 'scenes'], ['script', 'props'], ['script', 'storyboards'],
    ['characters', 'character-asset'], ['scenes', 'scene-asset'], ['props', 'prop-asset'],
    ['character-asset', 'storyboard-image'], ['scene-asset', 'storyboard-image'], ['prop-asset', 'storyboard-image'],
    ['storyboards', 'storyboard-image'], ['storyboard-image', 'shot-video'],
  ].map(([source, target]) => [nodeId(source), nodeId(target)])
  return createProductionWorkspace({
    nodes,
    connections,
    groups: [{ id: `${prefix}-workflow`, name: '短剧完整生产链', nodeIds: nodes.map((item) => item.id) }],
    template: { id: STARTER_TEMPLATE_ID, version: STARTER_TEMPLATE_VERSION },
    edgePrefix: `${prefix}-edge`,
  })
}
