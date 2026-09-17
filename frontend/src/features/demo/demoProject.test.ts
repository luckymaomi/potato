import { describe, expect, it } from 'vitest'
import { createDemoWorkspace, DEMO_TEMPLATE_ID } from './demoProject'
import type { Project } from '../../types/domain'

const project = {
  id: 8,
  title: 'Demo',
  style: 'cinematic',
  metadata: {},
  episodes: [{ id: 9, drama_id: 8, episode_number: 1, title: '第 1 集' }],
} satisfies Project

describe('Agnes Demo 模板', () => {
  it('所有需要 AI 的节点都通过 Agnes 真实执行且连线为曲线', () => {
    const workspace = createDemoWorkspace(project)
    expect(workspace.template?.id).toBe(DEMO_TEMPLATE_ID)
    expect(workspace.workspace_nodes).toHaveLength(11)
    expect(workspace.edges.every((edge) => edge.type === 'bezier')).toBe(true)
    const aiNodes = workspace.workspace_nodes.filter((item) => item.data.mode !== 'manual')
    expect(aiNodes.every((item) => item.data.provider === 'agnes')).toBe(true)
    expect(aiNodes.every((item) => !('isDemo' in item.data))).toBe(true)
    expect(aiNodes.every((item) => !item.data.model)).toBe(true)
  })
})
