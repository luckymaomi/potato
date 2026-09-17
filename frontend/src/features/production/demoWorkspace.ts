import { projectsApi } from '../../api/projects'
import type { Project } from '../../types/domain'
import type { CanvasWorkspaceSnapshot } from '../canvas/canvasTypes'
import type { ProductionNodeData, ProductionRole } from './catalog'
import { createProductionWorkspace, type ProductionNodeSpec } from './workspace'

export const DEMO_TEMPLATE_ID = 'agnes-short-drama-demo'
export const DEMO_VERSION = 8

function completedWhen(value: unknown): ProductionNodeData['status'] {
  return typeof value === 'string' && value.trim() ? 'completed' : 'idle'
}

function lines<T>(items: T[], values: (item: T) => Array<string | null | undefined>): string {
  return items.map((item, index) => `${index + 1}. ${values(item).filter(Boolean).join(' - ')}`).join('\n')
}

export function createDemoWorkspace(project: Project): CanvasWorkspaceSnapshot {
  const episode = project.episodes?.[0]
  const characters = project.characters || []
  const scenes = project.scenes || []
  const props = project.props || []
  const storyboards = episode?.storyboards || []
  const provider = { provider: 'agnes' }
  const media = { ...provider, aspectRatio: '9:16' }
  const imageUrls = (...values: Array<string | null | undefined>) => values.filter((value): value is string => Boolean(value))
  const specs: Array<[string, ProductionRole, string, number, number, Partial<ProductionNodeData>]> = [
    ['demo-outline', 'story', '故事想法｜35 秒竖屏悬疑剧', 40, 360, {
      textMode: 'manual',
      text: '创作一部约 35 秒、9:16 竖屏的悬疑微短剧《雾港回声》。两名角色是调查记者林澈与失踪证人沈雾；两个场景是雨夜旧码头与废弃信号室；关键道具是泛黄来信与微型录音机。恰好拆成来信引路、证人现身、录音反转三个可拍摄分镜。',
    }],
    ['demo-script', 'script', 'Agnes 编写完整剧本', 360, 360, { ...provider, episodeId: episode?.id, text: episode?.script_content || '', status: completedWhen(episode?.script_content) }],
    ['demo-character-extract', 'character-extraction', '提取两名角色资产', 700, 40, { ...provider, episodeId: episode?.id, text: lines(characters, (item) => [item.name, item.description, item.appearance]), linkedRecordIds: characters.map((item) => item.id) }],
    ['demo-scene-extract', 'scene-extraction', '提取两个场景资产', 700, 360, { ...provider, episodeId: episode?.id, text: lines(scenes, (item) => [item.location, item.prompt]), linkedRecordIds: scenes.map((item) => item.id) }],
    ['demo-prop-extract', 'prop-extraction', '提取两个关键道具资产', 700, 680, { ...provider, episodeId: episode?.id, text: lines(props, (item) => [item.name, item.description, item.prompt]), linkedRecordIds: props.map((item) => item.id) }],
    ['demo-character-lin', 'character-asset', '角色资产图｜林澈', 1040, 0, { ...media, linkedRecordIndex: 0, linkedRecordId: characters[0]?.id, prompt: characters[0]?.appearance || '中国女性调查记者林澈，利落短发，深灰防水风衣，全身定妆照，电影级写实光影', outputUrl: characters[0]?.image_url || undefined, status: completedWhen(characters[0]?.image_url) }],
    ['demo-character-shen', 'character-asset', '角色资产图｜沈雾', 1040, 180, { ...media, linkedRecordIndex: 1, linkedRecordId: characters[1]?.id, prompt: characters[1]?.appearance || '中国男性失踪证人沈雾，苍白消瘦，湿透黑色夹克，全身定妆照，电影级写实光影', outputUrl: characters[1]?.image_url || undefined, status: completedWhen(characters[1]?.image_url) }],
    ['demo-scene-pier', 'scene-asset', '场景资产图｜雨夜旧码头', 1040, 360, { ...media, linkedRecordIndex: 0, linkedRecordId: scenes[0]?.id, prompt: scenes[0]?.prompt || '深夜旧码头，暴雨浓雾，冷青环境光，无人物，竖屏电影场景设定图', outputUrl: scenes[0]?.image_url || undefined, status: completedWhen(scenes[0]?.image_url) }],
    ['demo-scene-signal', 'scene-asset', '场景资产图｜废弃信号室', 1040, 540, { ...media, linkedRecordIndex: 1, linkedRecordId: scenes[1]?.id, prompt: scenes[1]?.prompt || '废弃港口信号室，锈蚀控制台和闪烁红灯，无人物，竖屏电影场景设定图', outputUrl: scenes[1]?.image_url || undefined, status: completedWhen(scenes[1]?.image_url) }],
    ['demo-prop-letter', 'prop-asset', '道具资产图｜泛黄来信', 1040, 720, { ...media, linkedRecordIndex: 0, linkedRecordId: props[0]?.id, prompt: props[0]?.prompt || '被雨水打湿的泛黄信封，破损红色蜡封，电影关键道具设定图', outputUrl: props[0]?.image_url || undefined, status: completedWhen(props[0]?.image_url) }],
    ['demo-prop-recorder', 'prop-asset', '道具资产图｜微型录音机', 1040, 900, { ...media, linkedRecordIndex: 1, linkedRecordId: props[1]?.id, prompt: props[1]?.prompt || '磨损的黑色微型录音机，红色指示灯，电影关键道具设定图', outputUrl: props[1]?.image_url || undefined, status: completedWhen(props[1]?.image_url) }],
    ['demo-storyboard', 'storyboard-plan', 'Agnes 拆分三个分镜', 1370, 360, { ...provider, episodeId: episode?.id, storyboardCount: 3, text: lines(storyboards, (item) => [item.title, item.description, item.action, item.image_prompt, item.video_prompt]), linkedRecordIds: storyboards.map((item) => item.id) }],
    ['demo-shot-1-image', 'storyboard-image', '分镜图 1｜来信引路', 1710, 40, { ...media, linkedRecordIndex: 0, linkedRecordId: storyboards[0]?.id, prompt: storyboards[0]?.image_prompt || '林澈在暴雨旧码头拆开泛黄来信，9:16 电影分镜', referenceImages: imageUrls(characters[0]?.image_url, scenes[0]?.image_url, props[0]?.image_url), outputUrl: storyboards[0]?.image_url || undefined, status: completedWhen(storyboards[0]?.image_url) }],
    ['demo-shot-1-video', 'shot-video', '镜头视频 1｜镜头推进', 2040, 40, { ...media, linkedRecordIndex: 0, linkedRecordId: storyboards[0]?.id, prompt: storyboards[0]?.video_prompt || '镜头从信纸缓慢上移到林澈警觉的眼睛，雨滴划过镜头', referenceImages: imageUrls(storyboards[0]?.image_url), outputUrl: storyboards[0]?.video_url || undefined, status: completedWhen(storyboards[0]?.video_url) }],
    ['demo-shot-2-image', 'storyboard-image', '分镜图 2｜证人现身', 1710, 360, { ...media, linkedRecordIndex: 1, linkedRecordId: storyboards[1]?.id, prompt: storyboards[1]?.image_prompt || '沈雾在废弃信号室现身，与林澈隔着红灯对视，9:16 电影分镜', referenceImages: imageUrls(characters[0]?.image_url, characters[1]?.image_url, scenes[1]?.image_url), outputUrl: storyboards[1]?.image_url || undefined, status: completedWhen(storyboards[1]?.image_url) }],
    ['demo-shot-2-video', 'shot-video', '镜头视频 2｜人物对峙', 2040, 360, { ...media, linkedRecordIndex: 1, linkedRecordId: storyboards[1]?.id, prompt: storyboards[1]?.video_prompt || '镜头从林澈肩后横移，沈雾进入闪烁红光并开口', referenceImages: imageUrls(storyboards[1]?.image_url), outputUrl: storyboards[1]?.video_url || undefined, status: completedWhen(storyboards[1]?.video_url) }],
    ['demo-shot-3-image', 'storyboard-image', '分镜图 3｜录音反转', 1710, 680, { ...media, linkedRecordIndex: 2, linkedRecordId: storyboards[2]?.id, prompt: storyboards[2]?.image_prompt || '录音机红灯亮起，两人震惊，闪电照亮雾港，9:16 电影分镜', referenceImages: imageUrls(characters[0]?.image_url, characters[1]?.image_url, scenes[1]?.image_url, props[1]?.image_url), outputUrl: storyboards[2]?.image_url || undefined, status: completedWhen(storyboards[2]?.image_url) }],
    ['demo-shot-3-video', 'shot-video', '镜头视频 3｜录音亮起', 2040, 680, { ...media, linkedRecordIndex: 2, linkedRecordId: storyboards[2]?.id, prompt: storyboards[2]?.video_prompt || '录音机自行启动，镜头拉焦到林澈震惊的脸，随后断电', referenceImages: imageUrls(storyboards[2]?.image_url), outputUrl: storyboards[2]?.video_url || undefined, status: completedWhen(storyboards[2]?.video_url) }],
  ]
  const nodes: ProductionNodeSpec[] = specs.map(([id, role, title, x, y, data]) => ({ id, role, x, y, data: { title, ...data } }))
  const connections: Array<[string, string]> = [
    ['demo-outline', 'demo-script'], ['demo-script', 'demo-character-extract'], ['demo-script', 'demo-scene-extract'], ['demo-script', 'demo-prop-extract'], ['demo-script', 'demo-storyboard'],
    ['demo-character-extract', 'demo-character-lin'], ['demo-character-extract', 'demo-character-shen'], ['demo-scene-extract', 'demo-scene-pier'], ['demo-scene-extract', 'demo-scene-signal'], ['demo-prop-extract', 'demo-prop-letter'], ['demo-prop-extract', 'demo-prop-recorder'],
    ['demo-character-lin', 'demo-shot-1-image'], ['demo-scene-pier', 'demo-shot-1-image'], ['demo-prop-letter', 'demo-shot-1-image'], ['demo-storyboard', 'demo-shot-1-image'], ['demo-shot-1-image', 'demo-shot-1-video'],
    ['demo-character-lin', 'demo-shot-2-image'], ['demo-character-shen', 'demo-shot-2-image'], ['demo-scene-signal', 'demo-shot-2-image'], ['demo-storyboard', 'demo-shot-2-image'], ['demo-shot-2-image', 'demo-shot-2-video'],
    ['demo-character-lin', 'demo-shot-3-image'], ['demo-character-shen', 'demo-shot-3-image'], ['demo-scene-signal', 'demo-shot-3-image'], ['demo-prop-recorder', 'demo-shot-3-image'], ['demo-storyboard', 'demo-shot-3-image'], ['demo-shot-3-image', 'demo-shot-3-video'],
  ]
  return createProductionWorkspace({
    nodes,
    connections,
    groups: [
      { id: 'demo-workflow', name: 'Agnes《雾港回声》完整生产链', nodeIds: nodes.map((item) => item.id) },
      { id: 'demo-assets', name: '角色·场景·道具资产包', nodeIds: ['demo-character-lin', 'demo-character-shen', 'demo-scene-pier', 'demo-scene-signal', 'demo-prop-letter', 'demo-prop-recorder'] },
      { id: 'demo-shot-1', name: '镜头 1｜来信引路', nodeIds: ['demo-shot-1-image', 'demo-shot-1-video'] },
      { id: 'demo-shot-2', name: '镜头 2｜证人现身', nodeIds: ['demo-shot-2-image', 'demo-shot-2-video'] },
      { id: 'demo-shot-3', name: '镜头 3｜录音反转', nodeIds: ['demo-shot-3-image', 'demo-shot-3-video'] },
    ],
    template: { id: DEMO_TEMPLATE_ID, version: DEMO_VERSION },
    edgePrefix: 'demo-edge',
  })
}

export async function createDemoProject(): Promise<number> {
  const existing = await projectsApi.list({ page: 1, page_size: 200 })
  const current = existing.items.find((item) => item.metadata?.demo === true
    && item.metadata?.demo_provider === 'agnes'
    && item.metadata?.demo_version === DEMO_VERSION)
  if (current) return current.id

  const values = {
    title: '《雾港回声》· Agnes 完整短剧 Demo',
    description: '从故事、剧本和资产图，到三个分镜图、三个镜头视频与整集的完整竖屏悬疑短剧生产链。',
    genre: '悬疑微短剧',
    style: 'cinematic',
    metadata: { aspect_ratio: '9:16', demo: true, demo_version: DEMO_VERSION, demo_provider: 'agnes' },
  }
  const project = await projectsApi.create(values)
  await projectsApi.saveEpisodes(project.id, [{ episode_number: 1, title: '第 1 集｜来自未来的录音', duration: 35, script_content: '' }])
  const hydrated = await projectsApi.get(project.id)
  await projectsApi.saveCanvasLayout(project.id, createDemoWorkspace(hydrated), hydrated.canvas_revision)
  return project.id
}
