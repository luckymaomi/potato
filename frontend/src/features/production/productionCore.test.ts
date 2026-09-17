import { describe, expect, it } from 'vitest'
import type { Project } from '../../types/domain'
import { productionRoles } from './catalog'
import { createDemoWorkspace } from './demoWorkspace'
import { createStarterWorkspace } from './starterWorkspace'

const project: Project = {
  id: 7,
  title: '生产核心测试',
  description: '一段故事想法',
  metadata: { aspect_ratio: '9:16' },
  canvas_revision: 0,
  episodes: [{
    id: 11,
    drama_id: 7,
    episode_number: 1,
    title: '第 1 集',
    script_content: '',
    storyboards: [],
  }],
  characters: [],
  scenes: [],
  props: [],
}

describe('唯一短剧生产核心', () => {
  it('生产角色唯一，材料和资产分类只由角色目录派生', () => {
    const roleIds = productionRoles.map((item) => item.role)
    expect(new Set(roleIds).size).toBe(14)
    expect(roleIds).toHaveLength(14)
    expect(productionRoles.filter((item) => item.material === 'text')).toHaveLength(7)
    expect(productionRoles.filter((item) => item.material === 'image')).toHaveLength(5)
    expect(productionRoles.filter((item) => item.material === 'video')).toHaveLength(2)
    expect(productionRoles.filter((item) => item.assetKind === 'character').map((item) => item.role))
      .toEqual(['character-extraction', 'character-asset'])
  })

  it('起步模板直接生成当前节点合同，不保存派生的重复事实', () => {
    const workspace = createStarterWorkspace(project)
    expect(workspace.workspace_nodes).toHaveLength(11)
    expect(workspace.edges).toHaveLength(13)
    expect(workspace.workflow_groups).toHaveLength(1)
    expect(workspace.workspace_nodes.map((node) => node.data.role)).toEqual([
      'story',
      'script',
      'character-extraction',
      'scene-extraction',
      'prop-extraction',
      'character-asset',
      'scene-asset',
      'prop-asset',
      'storyboard-plan',
      'storyboard-image',
      'shot-video',
    ])
    const definitionOnlyKeys = new Set(
      productionRoles.flatMap((definition) => Object.keys(definition))
        .filter((key) => key !== 'role' && key !== 'textAction'),
    )
    for (const node of workspace.workspace_nodes) {
      expect(Object.keys(node.data).some((key) => definitionOnlyKeys.has(key))).toBe(false)
    }
  })

  it('完整 Demo 是同一生产合同的复杂投影', () => {
    const workspace = createDemoWorkspace(project)
    expect(workspace.workspace_nodes).toHaveLength(18)
    expect(workspace.edges).toHaveLength(27)
    expect(workspace.workflow_groups).toHaveLength(5)
    expect(workspace.workspace_nodes.every((node) => productionRoles.some((item) => item.role === node.data.role))).toBe(true)
  })
})
