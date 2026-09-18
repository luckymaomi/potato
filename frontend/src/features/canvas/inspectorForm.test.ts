import { describe, expect, it } from 'vitest'
import { createProductionNodeData } from '../production/catalog'
import { createInspectorFormValues } from './inspectorForm'

describe('节点检查器表单边界', () => {
  it('只投影可编辑字段，不把运行结果和生命周期对象交给 Form', () => {
    const data = createProductionNodeData('generic-image', {
      title: '角色资产图',
      parameters: { prompt: '正面照', referenceImages: ['/static/uploads/source.png'] },
      result: { outputUrl: '/static/projects/1/images/1.png', taskId: 'task-1' },
      history: [{ outputUrl: '/static/projects/1/images/old.png' }],
      status: 'running',
      execution: { message: '正在生成' },
      assetRefs: { episodes: [7] },
    })

    const values = createInspectorFormValues(data, 9)

    expect(Object.keys(values).sort()).toEqual(['parameters', 'title'])
    expect(values).toEqual({
      title: '角色资产图',
      parameters: expect.objectContaining({
        prompt: '正面照',
        episodeId: 7,
        referenceImages: ['/static/uploads/source.png'],
      }),
    })
    expect(values.parameters.referenceImages).not.toBe(data.parameters.referenceImages)
  })
})
