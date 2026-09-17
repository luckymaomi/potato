import type { Project } from '../../types/domain'
import type { CanvasWorkspaceSnapshot } from '../canvas/canvasTypes'
import type { ProductionNodeSpec } from './workspace'
import { createProductionWorkspace } from './workspace'

export const STARTER_TEMPLATE_ID = 'short-drama-production'
export const STARTER_TEMPLATE_VERSION = 5

export function createStarterWorkspace(project: Project): CanvasWorkspaceSnapshot {
  const prefix = `starter-${project.id}`
  const nodeId = (name: string) => `${prefix}-${name}`
  const episodeId = project.episodes?.[0]?.id
  const aspectRatio = project.metadata?.aspect_ratio || '9:16'
  const episodeRefs = episodeId ? { episodes: [episodeId] } : {}
  const nodes: ProductionNodeSpec[] = [
    { id: nodeId('story'), role: 'story', x: 40, y: 500, data: { parameters: { text: project.description || '' } } },
    { id: nodeId('script'), role: 'script', x: 360, y: 500, data: { title: '第 1 集剧本', assetRefs: episodeRefs, result: { text: project.episodes?.[0]?.script_content || '' } } },
    { id: nodeId('characters'), role: 'character-extraction', x: 680, y: 100, data: { assetRefs: episodeRefs } },
    { id: nodeId('scenes'), role: 'scene-extraction', x: 680, y: 500, data: { assetRefs: episodeRefs } },
    { id: nodeId('props'), role: 'prop-extraction', x: 680, y: 900, data: { assetRefs: episodeRefs } },
    { id: nodeId('character-asset'), role: 'character-asset', x: 1000, y: 100, data: { parameters: { aspectRatio } } },
    { id: nodeId('scene-asset'), role: 'scene-asset', x: 1000, y: 500, data: { parameters: { aspectRatio } } },
    { id: nodeId('prop-asset'), role: 'prop-asset', x: 1000, y: 900, data: { parameters: { aspectRatio } } },
    { id: nodeId('storyboards'), role: 'storyboard-plan', x: 1320, y: 500, data: { assetRefs: episodeRefs, parameters: { storyboardCount: 10 } } },
    { id: nodeId('storyboard-image'), role: 'storyboard-image', x: 1640, y: 500, data: { parameters: { aspectRatio } } },
    { id: nodeId('shot-video'), role: 'shot-video', x: 1960, y: 500, data: { parameters: { aspectRatio, duration: 4 } } },
    { id: nodeId('compose'), role: 'episode-compose', x: 2280, y: 500, data: { assetRefs: episodeRefs, parameters: { episodeId } } },
  ]
  const connections: Array<[string, string]> = [
    [nodeId('story'), nodeId('script')],
    [nodeId('script'), nodeId('characters')],
    [nodeId('script'), nodeId('scenes')],
    [nodeId('script'), nodeId('props')],
    [nodeId('characters'), nodeId('character-asset')],
    [nodeId('scenes'), nodeId('scene-asset')],
    [nodeId('props'), nodeId('prop-asset')],
    [nodeId('script'), nodeId('storyboards')],
    [nodeId('characters'), nodeId('storyboards')],
    [nodeId('scenes'), nodeId('storyboards')],
    [nodeId('props'), nodeId('storyboards')],
    [nodeId('storyboards'), nodeId('storyboard-image')],
    [nodeId('character-asset'), nodeId('storyboard-image')],
    [nodeId('scene-asset'), nodeId('storyboard-image')],
    [nodeId('prop-asset'), nodeId('storyboard-image')],
    [nodeId('storyboard-image'), nodeId('shot-video')],
    [nodeId('shot-video'), nodeId('compose')],
  ]
  return createProductionWorkspace({
    nodes,
    connections,
    groups: [{ id: `${prefix}-workflow`, name: '短剧完整生产链', nodeIds: nodes.map((node) => node.id) }],
    template: { id: STARTER_TEMPLATE_ID, version: STARTER_TEMPLATE_VERSION },
    edgePrefix: `${prefix}-edge`,
  })
}
