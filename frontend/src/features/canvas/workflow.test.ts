import type { Edge } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNode } from '../../store/workbenchStore'
import type { Project } from '../../types/domain'
import { createStarterWorkspace, STARTER_TEMPLATE_ID, STARTER_TEMPLATE_VERSION } from '../templates/starterWorkspace'
import { downstreamNodeIds, generatedEntityId, orderByConnections, prepareNodeForExecution } from './workflow'

function node(id: string, data: Partial<CanvasNode['data']> = {}): CanvasNode {
  return {
    id,
    type: 'canvas',
    position: { x: 0, y: 0 },
    data: { label: id, title: id, preset: 'text', status: 'idle', ...data },
  }
}

describe('默认工作区', () => {
  it('包含完整短剧主链和一个可运行工作流组', () => {
    const project: Project = {
      id: 42,
      title: '测试项目',
      metadata: {},
      episodes: [{ id: 7, drama_id: 42, episode_number: 1, title: '第 1 集' }],
    }
    const snapshot = createStarterWorkspace(project)

    expect(snapshot.template).toEqual({ id: STARTER_TEMPLATE_ID, version: STARTER_TEMPLATE_VERSION })
    expect(snapshot.workspace_nodes).toHaveLength(10)
    expect(snapshot.edges).toHaveLength(12)
    expect(new Set(snapshot.workspace_nodes.map((item) => item.data.preset))).toEqual(
      new Set(['text', 'character', 'scene', 'prop', 'storyboard', 'image', 'video']),
    )
    expect(snapshot.workflow_groups).toEqual([
      expect.objectContaining({ name: '默认短剧工作流', nodeIds: snapshot.workspace_nodes.map((item) => item.id) }),
    ])
    expect(snapshot.workspace_nodes.every((item) => item.data.episodeId === undefined || item.data.episodeId === 7)).toBe(true)
  })
})

describe('运行范围和依赖顺序', () => {
  const edges: Edge[] = [
    { id: 'a-b', source: 'a', target: 'b' },
    { id: 'a-c', source: 'a', target: 'c' },
    { id: 'b-d', source: 'b', target: 'd' },
    { id: 'c-d', source: 'c', target: 'd' },
  ]
  const nodes = ['a', 'b', 'c', 'd', 'outside'].map((id) => node(id))

  it('只选择起点及其下游，不包含无关节点', () => {
    expect(new Set(downstreamNodeIds(['a'], edges))).toEqual(new Set(['a', 'b', 'c', 'd']))
    expect(new Set(downstreamNodeIds(['b'], edges))).toEqual(new Set(['b', 'd']))
  })

  it('按连线拓扑运行，并保持运行范围边界', () => {
    const ordered = orderByConnections(nodes, edges, ['a', 'b', 'c', 'd'])
    const ids = ordered.map((item) => item.id)
    expect(ids[0]).toBe('a')
    expect(ids.at(-1)).toBe('d')
    expect(ids).not.toContain('outside')
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'))
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'))
  })

  it('明确拒绝运行包含循环的节点范围', () => {
    expect(() => orderByConnections(nodes, [...edges, { id: 'd-a', source: 'd', target: 'a' }], ['a', 'b', 'c', 'd']))
      .toThrow('存在循环连线')
  })
})

describe('连线输入传递', () => {
  it('为空提示词补充上游文本，并为图生图合并上游图片', () => {
    const script = node('script', { text: '雨夜，主角推开仓库门。' })
    const reference = node('reference', { preset: 'image', mediaKind: 'image', mediaUrl: '/static/reference.png' })
    const target = node('target', {
      preset: 'image',
      mode: 'image-to-image',
      prompt: '',
      referenceImages: ['https://example.com/existing.png'],
    })
    const prepared = prepareNodeForExecution(target, [script, reference, target], [
      { source: 'script', target: 'target' },
      { source: 'reference', target: 'target' },
    ])

    expect(prepared.data.prompt).toBe('雨夜，主角推开仓库门。')
    expect(prepared.data.referenceImages).toEqual([
      'https://example.com/existing.png',
      '/static/reference.png',
    ])
  })

  it('不让上游内容覆盖用户已经填写的内容', () => {
    const source = node('source', { text: '上游文本' })
    const target = node('target', { preset: 'video', mode: 'text-to-video', prompt: '用户提示词' })
    const prepared = prepareNodeForExecution(target, [source, target], [{ source: 'source', target: 'target' }])

    expect(prepared.data.prompt).toBe('用户提示词')
    expect(prepared.data.referenceImages).toBeUndefined()
  })

  it('优先把分镜实体传给分镜图，不会误用角色实体 ID', () => {
    const character = node('character', { preset: 'character', entityId: 11, mediaKind: 'image', mediaUrl: '/static/character.png' })
    const storyboard = node('storyboard', { preset: 'storyboard', mode: 'storyboard', entityId: 29, prompt: '港口远景' })
    const target = node('target', { preset: 'storyboard', mode: 'image-to-image', prompt: '' })
    const prepared = prepareNodeForExecution(target, [character, storyboard, target], [
      { source: 'character', target: 'target' },
      { source: 'storyboard', target: 'target' },
    ])

    expect(prepared.data.entityId).toBe(29)
  })
})

describe('提取结果传递', () => {
  it('读取第一条角色、场景或道具实体 ID', () => {
    expect(generatedEntityId('characters', { characters: [{ id: 3 }] })).toBe(3)
    expect(generatedEntityId('scenes', { scenes: [{ id: '8' }] })).toBe(8)
    expect(generatedEntityId('props', { props: [{ id: 13 }] })).toBe(13)
    expect(generatedEntityId('story', { text: '剧本' })).toBeUndefined()
  })
})
