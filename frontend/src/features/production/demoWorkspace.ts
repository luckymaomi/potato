import { projectsApi } from '../../api/projects'
import type { Character, Project, Prop, Scene } from '../../types/domain'
import type { CanvasWorkspaceSnapshot } from '../canvas/canvasTypes'
import type { AssetReferences, ProductionNodeData, ProductionRole } from './catalog'
import { mediaLifecycleState } from './lifecycle'
import { RAINY_NIGHT_DEMO } from './rainyNightDemoDefinition'
import { createProductionWorkspace, type ProductionNodeSpec } from './workspace'

export const DEMO_TEMPLATE_ID = RAINY_NIGHT_DEMO.templateId
export const DEMO_VERSION = RAINY_NIGHT_DEMO.version

const assetSpecs: Array<{ role: ProductionRole; kind: keyof AssetReferences; name: string; prompt: string }> = [
  ...RAINY_NIGHT_DEMO.characters.map((item) => ({ role: 'character-asset' as const, kind: 'characters' as const, name: item.name, prompt: item.assetPrompt })),
  ...RAINY_NIGHT_DEMO.scenes.map((item) => ({ role: 'scene-asset' as const, kind: 'scenes' as const, name: item.location, prompt: item.prompt })),
  ...RAINY_NIGHT_DEMO.props.map((item) => ({ role: 'prop-asset' as const, kind: 'props' as const, name: item.name, prompt: item.prompt })),
]

const shots = RAINY_NIGHT_DEMO.storyboards

function refs(values: number[]): AssetReferences {
  return values.length ? { storyboards: values } : {}
}

function completed(value: ReturnType<typeof mediaLifecycleState>): ProductionNodeData['status'] {
  return value?.status === 'completed' && value.available ? 'completed' : 'idle'
}

function entityByName(project: Project, kind: keyof AssetReferences, name: string): Character | Scene | Prop | undefined {
  if (kind === 'characters') return project.characters?.find((item) => item.name === name)
  if (kind === 'scenes') return project.scenes?.find((item) => item.location === name)
  return project.props?.find((item) => item.name === name)
}

function textResult(items: Array<Record<string, unknown>>, fields: string[]): string {
  return items.map((item, index) => `${index + 1}. ${fields.flatMap((field) => typeof item[field] === 'string' ? [item[field]] : []).join(' - ')}`).join('\n')
}

export function createDemoWorkspace(project: Project): CanvasWorkspaceSnapshot {
  const episode = project.episodes?.[0]
  const episodeRefs = episode ? { episodes: [episode.id] } : {}
  const { provider, imageModel, videoModel, aspectRatio, duration } = RAINY_NIGHT_DEMO.media
  const nodes: ProductionNodeSpec[] = [
    { id: 'rain-delivery-story', role: 'story', x: 40, y: 950, data: { title: '故事｜雨夜外卖', parameters: { text: RAINY_NIGHT_DEMO.story }, result: { text: RAINY_NIGHT_DEMO.story }, status: 'completed' } },
    { id: 'rain-delivery-script', role: 'script', x: 360, y: 950, data: { title: '预写四场剧本', parameters: { text: episode?.script_content || RAINY_NIGHT_DEMO.script }, assetRefs: episodeRefs, result: { text: episode?.script_content || RAINY_NIGHT_DEMO.script }, status: episode ? 'completed' : 'idle' } },
    { id: 'rain-delivery-characters', role: 'character-extraction', x: 680, y: 350, data: { title: '预写角色资产', parameters: { text: textResult(RAINY_NIGHT_DEMO.characters as unknown as Array<Record<string, unknown>>, ['name', 'description', 'appearance']) }, assetRefs: episodeRefs, result: { text: textResult(RAINY_NIGHT_DEMO.characters as unknown as Array<Record<string, unknown>>, ['name', 'description', 'appearance']), assetRefs: { characters: (project.characters || []).map((item) => item.id) } }, status: 'completed' } },
    { id: 'rain-delivery-scenes', role: 'scene-extraction', x: 680, y: 1090, data: { title: '预写场景资产', parameters: { text: textResult(RAINY_NIGHT_DEMO.scenes as unknown as Array<Record<string, unknown>>, ['location', 'prompt']) }, assetRefs: episodeRefs, result: { text: textResult(RAINY_NIGHT_DEMO.scenes as unknown as Array<Record<string, unknown>>, ['location', 'prompt']), assetRefs: { scenes: (project.scenes || []).map((item) => item.id) } }, status: 'completed' } },
    { id: 'rain-delivery-props', role: 'prop-extraction', x: 680, y: 1720, data: { title: '预写道具资产', parameters: { text: textResult(RAINY_NIGHT_DEMO.props as unknown as Array<Record<string, unknown>>, ['name', 'description', 'prompt']) }, assetRefs: episodeRefs, result: { text: textResult(RAINY_NIGHT_DEMO.props as unknown as Array<Record<string, unknown>>, ['name', 'description', 'prompt']), assetRefs: { props: (project.props || []).map((item) => item.id) } }, status: 'completed' } },
  ]
  const connections: Array<[string, string]> = [
    ['rain-delivery-story', 'rain-delivery-script'],
    ['rain-delivery-script', 'rain-delivery-characters'],
    ['rain-delivery-script', 'rain-delivery-scenes'],
    ['rain-delivery-script', 'rain-delivery-props'],
  ]
  const assetNodeIds = new Map<string, string>()
  assetSpecs.forEach((asset, index) => {
    const assetIndex = assetSpecs.slice(0, index).filter((candidate) => candidate.kind === asset.kind).length
    const id = addAssetNode(nodes, project, asset, index, assetIndex, provider, imageModel, aspectRatio)
    assetNodeIds.set(assetKey(asset.kind, asset.name), id)
  })

  const storyboards = episode?.storyboards || []
  shots.forEach((shot, index) => {
    const storyboard = storyboards[index]
    const storyboardRefs = storyboard ? refs([storyboard.id]) : {}
    const imageMedia = mediaLifecycleState(project, 'image', storyboard?.current_image_generation_id)
    const videoMedia = mediaLifecycleState(project, 'video', storyboard?.current_video_generation_id)
    const imageId = `rain-delivery-shot-${index + 1}-image`
    const videoId = `rain-delivery-shot-${index + 1}-video`
    const rowY = 40 + index * 210
    nodes.push({
      id: imageId, role: 'storyboard-image', x: 1320, y: rowY,
      data: { title: `分镜图 ${index + 1}｜${shot.title}`, parameters: { provider, model: imageModel, aspectRatio, assetIndex: index, prompt: storyboard?.image_prompt || shot.image_prompt }, assetRefs: storyboardRefs, result: { outputUrl: imageMedia?.url || undefined, generationId: imageMedia?.generation_id, localPath: imageMedia?.local_path || undefined, mediaAvailable: imageMedia?.available === true, assetRefs: storyboardRefs }, status: completed(imageMedia) },
    })
    nodes.push({
      id: videoId, role: 'shot-video', x: 1640, y: rowY,
      data: { title: `镜头视频 ${index + 1}｜${shot.title}`, parameters: { provider, model: videoModel, aspectRatio, duration, assetIndex: index, prompt: storyboard?.video_prompt || shot.video_prompt }, assetRefs: storyboardRefs, result: { outputUrl: videoMedia?.url || undefined, generationId: videoMedia?.generation_id, localPath: videoMedia?.local_path || undefined, mediaAvailable: videoMedia?.available === true, assetRefs: storyboardRefs }, status: completed(videoMedia) },
    })
    for (const [kind, names] of [
      ['characters', shot.characters],
      ['scenes', shot.scenes],
      ['props', shot.props],
    ] as const) {
      names.forEach((name) => {
        const source = assetNodeIds.get(assetKey(kind, name))
        if (!source) throw new Error(`《雨夜外卖》缺少资产节点：${kind}/${name}`)
        connections.push([source, imageId])
      })
    }
    connections.push([imageId, videoId], [videoId, 'rain-delivery-compose'])
  })
  const episodeMedia = mediaLifecycleState(project, 'video', episode?.current_video_generation_id)
  nodes.push({ id: 'rain-delivery-compose', role: 'episode-compose', x: 1960, y: 950, data: { title: '合成《雨夜外卖》完整成片', parameters: { episodeId: episode?.id }, assetRefs: episodeRefs, result: { outputUrl: episodeMedia?.url || undefined, generationId: episodeMedia?.generation_id, localPath: episodeMedia?.local_path || undefined, mediaAvailable: episodeMedia?.available === true }, status: completed(episodeMedia) } })

  return createProductionWorkspace({
    nodes,
    connections,
    groups: [{ id: 'rain-delivery-workflow', name: 'PearAPI《雨夜外卖》运行未完成媒体', nodeIds: nodes.map((node) => node.id) }],
    template: { id: DEMO_TEMPLATE_ID, version: DEMO_VERSION },
    edgePrefix: 'rain-delivery-edge',
  })
}

function addAssetNode(
  nodes: ProductionNodeSpec[],
  project: Project,
  asset: (typeof assetSpecs)[number],
  layoutIndex: number,
  assetIndex: number,
  provider: string,
  model: string,
  aspectRatio: string,
): string {
  const item = entityByName(project, asset.kind, asset.name)
  const explicitRefs = item ? { [asset.kind]: [item.id] } as AssetReferences : {}
  const media = mediaLifecycleState(project, 'image', item?.current_image_generation_id)
  const id = `rain-delivery-${String(asset.kind)}-${layoutIndex + 1}`
  nodes.push({
    id,
    role: asset.role,
    x: 1000,
    y: 40 + layoutIndex * 210,
    data: {
      title: `${asset.name}｜标准资产图`,
      parameters: { provider, model, aspectRatio, prompt: asset.prompt, assetIndex },
      assetRefs: explicitRefs,
      result: { outputUrl: media?.url || undefined, generationId: media?.generation_id, localPath: media?.local_path || undefined, mediaAvailable: media?.available === true, assetRefs: explicitRefs },
      status: completed(media),
    },
  })
  return id
}

function assetKey(kind: keyof AssetReferences, name: string): string {
  return `${kind}:${name}`
}

export async function createDemoProject(): Promise<number> {
  const existing = await projectsApi.list({ page: 1, page_size: 200 })
  const demo = existing.items.find((item) => item.metadata?.demo === true)
  if (!demo) throw new Error('尚未初始化《雨夜外卖》Demo，请先在 backend 目录运行 npm.cmd run init:rainy-night-demo')
  const hydrated = await projectsApi.get(demo.id)
  const layout = hydrated.metadata?.canvas_layout as { workspace_nodes?: unknown[] } | undefined
  const complete = hydrated.metadata.demo_version === DEMO_VERSION
    && hydrated.characters?.length === RAINY_NIGHT_DEMO.characters.length
    && hydrated.scenes?.length === RAINY_NIGHT_DEMO.scenes.length
    && hydrated.props?.length === RAINY_NIGHT_DEMO.props.length
    && hydrated.episodes?.[0]?.storyboards?.length === RAINY_NIGHT_DEMO.storyboards.length
    && layout?.workspace_nodes?.length === 36
  if (!complete) throw new Error('《雨夜外卖》Demo 尚未完整初始化，请重新运行 npm.cmd run init:rainy-night-demo')
  return demo.id
}
