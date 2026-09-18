import { describe, expect, it, vi } from 'vitest'
import type { Edge } from '@xyflow/react'
import { projectsApi } from '../../api/projects'
import type { Project } from '../../types/domain'
import type { CanvasNode } from '../canvas/canvasTypes'
import { createProductionNodeData, productionPlugins, productionPlugin } from './catalog'
import { resolveNodeContext } from './contextResolver'
import { createDemoProject, createDemoWorkspace, DEMO_VERSION } from './demoWorkspace'
import { createStarterWorkspace } from './starterWorkspace'

const project: Project = {
  id: 7,
  title: '生产核心测试',
  description: '一段故事想法',
  metadata: { aspect_ratio: '9:16' },
  canvas_revision: 0,
  episodes: [{ id: 11, drama_id: 7, episode_number: 1, title: '第 1 集', script_content: '', storyboards: [] }],
  characters: [],
  scenes: [],
  props: [],
}

function expectDagWorkspace(workspace: ReturnType<typeof createStarterWorkspace>, expectedNodes: number) {
  expect(workspace.workspace_nodes).toHaveLength(expectedNodes)
  expect(workspace.edges.length).toBeGreaterThan(expectedNodes - 1)
  expect(workspace.workflow_groups).toHaveLength(1)
  expect(new Set(workspace.workspace_nodes.map((node) => node.position.x)).size).toBeGreaterThan(3)
  expect(new Set(workspace.workspace_nodes.map((node) => node.position.y)).size).toBeGreaterThan(1)
  expect(new Set(workspace.workflow_groups[0]?.nodeIds)).toEqual(new Set(workspace.workspace_nodes.map((node) => node.id)))
  const incoming = new Map(workspace.workspace_nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(workspace.workspace_nodes.map((node) => [node.id, [] as string[]]))
  workspace.edges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })
  const queue = workspace.workspace_nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  let visited = 0
  while (queue.length) {
    const id = queue.shift() as string
    visited += 1
    outgoing.get(id)?.forEach((target) => {
      const next = (incoming.get(target) || 0) - 1
      incoming.set(target, next)
      if (next === 0) queue.push(target)
    })
  }
  expect(visited).toBe(expectedNodes)
}

describe('插件化短剧生产核心', () => {
  it('每个节点插件完整声明角色、用途、输入输出、参数、提示词、默认方式和命令构造', () => {
    const roles = productionPlugins.map((plugin) => plugin.role)
    expect(roles).toHaveLength(14)
    expect(roles).not.toContain('generic-text')
    expect(new Set(roles).size).toBe(roles.length)
    productionPlugins.forEach((plugin) => {
      expect(plugin.label).toBeTruthy()
      expect(plugin.material).toMatch(/^(text|image|video)$/u)
      expect(plugin.purpose).toBeTruthy()
      expect(Array.isArray(plugin.inputs)).toBe(true)
      expect(plugin.outputs.length).toBeGreaterThan(0)
      expect(plugin.parameters.length).toBeGreaterThan(0)
      expect(plugin.defaultMethod).toBeTruthy()
      expect(typeof plugin.buildCommand).toBe('function')
      if (plugin.defaultMethod === 'ai-text') expect(plugin.promptKey).toBeTruthy()
    })
  })

  it('节点快照只保存插件参数、显式资产引用和运行结果，不复制插件事实', () => {
    const data = createProductionNodeData('storyboard-image', {
      parameters: { prompt: '雨夜码头', assetIndex: 1 },
      assetRefs: { storyboards: [31] },
    })
    expect(data).toMatchObject({
      role: 'storyboard-image',
      parameters: { prompt: '雨夜码头', assetIndex: 1 },
      assetRefs: { storyboards: [31] },
      result: {},
      status: 'idle',
    })
    expect(Object.keys(data).sort()).toEqual(['assetRefs', 'error', 'history', 'parameters', 'result', 'role', 'status', 'title'])
  })

  it('同一个资产图插件同时支持文生图、参考图生成和文字加参考图生成', () => {
    const plugin = productionPlugin('character-asset')
    expect(plugin.methods).toEqual(['text-to-image', 'image-to-image'])
    const data = createProductionNodeData('character-asset', {
      parameters: {
        method: 'image-to-image',
        prompt: '保持黄色外卖服和黑框眼镜，生成正面标准照',
        referenceImages: ['/static/uploads/face.png', '/static/uploads/uniform.png'],
      },
      assetRefs: { characters: [21] },
    })
    expect(plugin.buildCommand({ project, data, context: { values: {}, texts: [], images: [], videos: [], assetRefs: data.assetRefs } })).toMatchObject({
      kind: 'image',
      mode: 'image-to-image',
      prompt: '保持黄色外卖服和黑框眼镜，生成正面标准照',
      reference_images: ['/static/uploads/face.png', '/static/uploads/uniform.png'],
    })
  })

  it('镜头视频可独立切换文生视频，纯文本模式不会暗用连入图片', () => {
    const plugin = productionPlugin('shot-video')
    expect(plugin.methods).toEqual(['text-to-video', 'image-to-video'])
    const data = createProductionNodeData('shot-video', {
      parameters: { method: 'text-to-video', prompt: '人物转身离开', provider: 'pearapi', model: 'grok-imagine-video' },
    })
    expect(plugin.buildCommand({
      project,
      data,
      context: { values: {}, texts: [], images: ['/static/storyboard.png'], videos: [], assetRefs: {} },
    })).toMatchObject({
      kind: 'video',
      mode: 'text-to-video',
      prompt: '人物转身离开',
      reference_images: [],
    })
  })

  it('上下文解析只消费显式连线的直接上游，并按插件输出类型而不是角色猜测', () => {
    const nodes: CanvasNode[] = [
      { id: 'story', type: 'canvas', position: { x: 0, y: 0 }, data: createProductionNodeData('story', { parameters: { text: '故事' }, result: { text: '故事' } }) },
      { id: 'script', type: 'canvas', position: { x: 1, y: 0 }, data: createProductionNodeData('script', { status: 'completed', result: { text: '已完成剧本' } }) },
      { id: 'character', type: 'canvas', position: { x: 2, y: 0 }, data: createProductionNodeData('character-extraction', { status: 'completed', result: { text: '角色', assetRefs: { characters: [21] } } }) },
      { id: 'asset', type: 'canvas', position: { x: 3, y: 0 }, data: createProductionNodeData('character-asset', { status: 'completed', result: { outputUrl: '/static/character.png', generationId: 1, localPath: 'character.png', mediaAvailable: true } }) },
      { id: 'scene', type: 'canvas', position: { x: 4, y: 0 }, data: createProductionNodeData('scene-extraction') },
    ]
    const edges: Edge[] = [
      { id: '1', source: 'story', target: 'script' },
      { id: '2', source: 'script', target: 'character' },
      { id: '3', source: 'character', target: 'asset' },
      { id: '4', source: 'asset', target: 'scene' },
      { id: '5', source: 'script', target: 'scene' },
    ]
    const context = resolveNodeContext(nodes[4] as CanvasNode, nodes, edges)
    expect(context.values.script).toBe('已完成剧本')
    expect(productionPlugin(nodes[4]?.data.role ?? 'scene-extraction').inputs.map((item) => item.kind)).toContain('script')
  })

  it('起步模板和 Agnes 预写 Demo 都投影为分层有向无环图', () => {
    const starter = createStarterWorkspace(project)
    const demo = createDemoWorkspace(project)
    expectDagWorkspace(starter, 12)
    expectDagWorkspace(demo, 36)
    expect(starter.edges).toHaveLength(17)
    expect(demo.edges).toHaveLength(56)
    expect(demo.workspace_nodes.every((node) => productionPlugins.some((plugin) => plugin.role === node.data.role))).toBe(true)
    const compose = demo.workspace_nodes.find((node) => node.data.role === 'episode-compose')
    expect(demo.edges.filter((edge) => edge.target === compose?.id)).toHaveLength(10)
    expect(demo.edges.filter((edge) => edge.target === compose?.id).every((edge) => (
      demo.workspace_nodes.find((node) => node.id === edge.source)?.data.role === 'shot-video'
    ))).toBe(true)
    expect(demo.workspace_nodes.filter((node) => node.data.role === 'character-asset').map((node) => node.data.parameters.assetIndex)).toEqual([0, 1, 2, 3])
    expect(demo.workspace_nodes.filter((node) => node.data.role === 'scene-asset').map((node) => node.data.parameters.assetIndex)).toEqual([0, 1, 2])
    expect(demo.workspace_nodes.filter((node) => node.data.role === 'prop-asset').map((node) => node.data.parameters.assetIndex)).toEqual([0, 1, 2])
    expect(demo.workspace_nodes.filter((node) => ['character-asset', 'scene-asset', 'prop-asset', 'storyboard-image'].includes(node.data.role)).every((node) => (
      node.data.parameters.provider === 'agnes' && node.data.parameters.model === 'agnes-image-2.5-flash'
    ))).toBe(true)
    expect(demo.workspace_nodes.filter((node) => node.data.role === 'shot-video').every((node) => (
      node.data.parameters.provider === 'agnes' && node.data.parameters.model === 'agnes-video-2.5-flash'
    ))).toBe(true)
    expect(demo.workspace_nodes.filter((node) => node.data.role === 'story' || node.data.role === 'script').every((node) => (
      node.data.status === 'completed' && Boolean(node.data.result.text)
    ))).toBe(true)
  })

  it('雨夜外卖逐镜引用只包含实际入画资产', () => {
    const hydrated: Project = {
      ...project,
      characters: [
        { id: 21, drama_id: 7, name: '小林', image_url: '/static/xiaolin.png', current_image_generation_id: 201 },
        { id: 22, drama_id: 7, name: '苏晴', image_url: '/static/suqing.png', current_image_generation_id: 202 },
        { id: 23, drama_id: 7, name: '股东甲', image_url: '/static/shareholder.png', current_image_generation_id: 203 },
        { id: 24, drama_id: 7, name: '保安', image_url: '/static/security.png', current_image_generation_id: 204 },
      ],
      scenes: [
        { id: 31, drama_id: 7, location: '雨夜街道', image_url: '/static/street.png', current_image_generation_id: 211 },
        { id: 32, drama_id: 7, location: '写字楼大厅', image_url: '/static/lobby.png', current_image_generation_id: 212 },
        { id: 33, drama_id: 7, location: '总裁办公室', image_url: '/static/office.png', current_image_generation_id: 213 },
      ],
      props: [
        { id: 41, drama_id: 7, name: '外卖箱', image_url: '/static/delivery-box.png', current_image_generation_id: 221 },
        { id: 42, drama_id: 7, name: '合同', image_url: '/static/contract.png', current_image_generation_id: 222 },
        { id: 43, drama_id: 7, name: '电动车', image_url: '/static/scooter.png', current_image_generation_id: 223 },
      ],
      episodes: [{
        ...project.episodes![0]!,
        storyboards: Array.from({ length: 10 }, (_, index) => ({
          id: 100 + index,
          episode_id: 11,
          storyboard_number: index + 1,
          image_url: `/static/shot-${index + 1}.png`,
          video_url: `/static/shot-${index + 1}.mp4`,
          current_image_generation_id: 300 + index,
          current_video_generation_id: 400 + index,
          character_ids: index === 5 ? [21, 22, 23] : index === 6 || index === 8 ? [22] : index === 9 ? [21, 22] : [],
          scene_ids: [33],
          prop_ids: index === 5 || index === 9 ? [41] : [],
        })),
      }],
      media_lifecycle: {
        images: Object.fromEntries(([
          [201, '/static/xiaolin.png'], [202, '/static/suqing.png'], [203, '/static/shareholder.png'], [204, '/static/security.png'],
          [211, '/static/street.png'], [212, '/static/lobby.png'], [213, '/static/office.png'],
          [221, '/static/delivery-box.png'], [222, '/static/contract.png'], [223, '/static/scooter.png'],
          ...Array.from({ length: 10 }, (_, index) => [300 + index, `/static/shot-${index + 1}.png`] as const),
        ] satisfies Array<readonly [number, string]>).map(([id, url]) => [String(id), { generation_id: id, status: 'completed', url, local_path: `projects/7/images/${id}.png`, available: true, failure_stage: null }])),
        videos: Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
          const id = 400 + index
          return [String(id), { generation_id: id, status: 'completed', url: `/static/shot-${index + 1}.mp4`, local_path: `projects/7/videos/${id}.mp4`, available: true, failure_stage: null }]
        })),
      },
    }
    const workspace = createDemoWorkspace(hydrated)
    const incomingTitles = (targetId: string) => workspace.edges
      .filter((edge) => edge.target === targetId)
      .map((edge) => workspace.workspace_nodes.find((node) => node.id === edge.source)?.data.title)
      .filter(Boolean)
    expect(workspace.workspace_nodes.some((node) => String(node.data.role) === 'generic-text')).toBe(false)
    expect(workspace.workspace_nodes.find((node) => node.id === 'rain-delivery-shot-6-image')?.data.parameters.prompt).toContain('办公室门口全景')
    expect(workspace.workspace_nodes.find((node) => node.id === 'rain-delivery-shot-10-image')?.data.parameters.prompt).toContain('小林转身离开')
    for (const index of [5, 6, 8, 9]) {
      const storyboardId = 100 + index
      const image = workspace.workspace_nodes.find((node) => node.id === `rain-delivery-shot-${index + 1}-image`)
      const video = workspace.workspace_nodes.find((node) => node.id === `rain-delivery-shot-${index + 1}-video`)
      expect(image?.data.assetRefs.storyboards).toEqual([storyboardId])
      expect(video?.data.assetRefs.storyboards).toEqual([storyboardId])
    }
    expect(hydrated.episodes?.[0]?.storyboards?.[5]).toMatchObject({ character_ids: [21, 22, 23], scene_ids: [33], prop_ids: [41] })
    expect(hydrated.episodes?.[0]?.storyboards?.[6]).toMatchObject({ character_ids: [22], scene_ids: [33], prop_ids: [] })
    expect(hydrated.episodes?.[0]?.storyboards?.[8]).toMatchObject({ character_ids: [22], scene_ids: [33], prop_ids: [] })
    expect(hydrated.episodes?.[0]?.storyboards?.[9]).toMatchObject({ character_ids: [21, 22], scene_ids: [33], prop_ids: [41] })
    expect(incomingTitles('rain-delivery-shot-6-image')).toEqual(expect.arrayContaining([
      '小林｜标准资产图', '苏晴｜标准资产图', '股东甲｜标准资产图', '总裁办公室｜标准资产图', '外卖箱｜标准资产图',
    ]))
    expect(incomingTitles('rain-delivery-shot-6-image')).toHaveLength(5)
    expect(incomingTitles('rain-delivery-shot-7-image')).toEqual(expect.arrayContaining(['苏晴｜标准资产图', '总裁办公室｜标准资产图']))
    expect(incomingTitles('rain-delivery-shot-7-image')).toHaveLength(2)
    expect(incomingTitles('rain-delivery-shot-9-image')).toEqual(expect.arrayContaining(['苏晴｜标准资产图', '总裁办公室｜标准资产图']))
    expect(incomingTitles('rain-delivery-shot-9-image')).toHaveLength(2)
    expect(incomingTitles('rain-delivery-shot-10-image')).toEqual(expect.arrayContaining(['小林｜标准资产图', '苏晴｜标准资产图', '总裁办公室｜标准资产图', '外卖箱｜标准资产图']))
    expect(incomingTitles('rain-delivery-shot-10-image')).toHaveLength(4)
    const xiaolin = workspace.workspace_nodes.find((node) => node.data.title === '小林｜标准资产图')
    expect(xiaolin?.data).toMatchObject({ status: 'completed', result: { generationId: 201 } })
    expect(workspace.workspace_nodes.find((node) => node.id === 'rain-delivery-shot-6-image')?.data.result.generationId).toBe(305)
    expect(workspace.workspace_nodes.find((node) => node.id === 'rain-delivery-shot-6-video')?.data.result.generationId).toBe(405)
    expect(workspace.edges.filter((edge) => edge.source === xiaolin?.id && edge.target.includes('-image'))).toHaveLength(6)
    const shot6 = workspace.workspace_nodes.find((node) => node.id === 'rain-delivery-shot-6-image') as CanvasNode
    const shot7 = workspace.workspace_nodes.find((node) => node.id === 'rain-delivery-shot-7-image') as CanvasNode
    const shot6Context = resolveNodeContext(shot6, workspace.workspace_nodes, workspace.edges)
    expect(shot6Context.images).toEqual([
      '/static/xiaolin.png', '/static/suqing.png', '/static/shareholder.png', '/static/office.png', '/static/delivery-box.png',
    ])
    expect(shot6Context.assetRefs).toMatchObject({ storyboards: [105], characters: [21, 22, 23], scenes: [33], props: [41] })
    expect(resolveNodeContext(shot7, workspace.workspace_nodes, workspace.edges).images).toEqual(['/static/suqing.png', '/static/office.png'])
  })

  it('完整 Demo 按钮只打开已经由后端初始化完成的唯一 Demo', async () => {
    const initialized: Project = {
      ...project,
      id: 19,
      title: '《雨夜外卖》· Agnes 媒体生成 Demo',
      canvas_revision: 4,
      metadata: { aspect_ratio: '9:16', demo: true, demo_provider: 'agnes', demo_version: DEMO_VERSION, canvas_layout: { workspace_nodes: Array.from({ length: 36 }, () => ({})) } },
      characters: Array.from({ length: 4 }, (_, index) => ({ id: index + 1, drama_id: 19, name: `角色${index + 1}` })),
      scenes: Array.from({ length: 3 }, (_, index) => ({ id: index + 1, drama_id: 19, location: `场景${index + 1}` })),
      props: Array.from({ length: 3 }, (_, index) => ({ id: index + 1, drama_id: 19, name: `道具${index + 1}` })),
      episodes: [{ id: 1, drama_id: 19, episode_number: 1, title: '第 1 集｜雨夜外卖', storyboards: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, episode_id: 1, storyboard_number: index + 1 })) }],
    }
    const list = vi.spyOn(projectsApi, 'list').mockResolvedValue({
      items: [initialized],
      pagination: { page: 1, page_size: 200, total: 1, total_pages: 1 },
    })
    const create = vi.spyOn(projectsApi, 'create')
    const update = vi.spyOn(projectsApi, 'update').mockResolvedValue(initialized)
    const saveEpisodes = vi.spyOn(projectsApi, 'saveEpisodes')
    const get = vi.spyOn(projectsApi, 'get').mockResolvedValue(initialized)
    const saveCanvas = vi.spyOn(projectsApi, 'saveCanvasLayout')
    try {
      await expect(createDemoProject()).resolves.toBe(19)
      expect(list).toHaveBeenCalledOnce()
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(saveEpisodes).not.toHaveBeenCalled()
      expect(get).toHaveBeenCalledWith(19)
      expect(saveCanvas).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
    }
  })
})
