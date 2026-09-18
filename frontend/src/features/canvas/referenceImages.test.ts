import { describe, expect, it } from 'vitest'
import { addReferenceImage, removeReferenceImage } from './referenceImages'
import { createProductionNodeData } from '../production/catalog'
import { useCanvasStore } from '../../store/canvasStore'
import type { CanvasNode } from './canvasTypes'

describe('参考图编辑', () => {
  it('保留 URL 与本地静态图并自动去重', () => {
    expect(addReferenceImage([], ' https://cdn.test/reference.png ')).toEqual([
      'https://cdn.test/reference.png',
    ])
    expect(addReferenceImage(['/static/uploads/local.png'], '/static/uploads/local.png')).toEqual([
      '/static/uploads/local.png',
    ])
  })

  it('拒绝普通文本并可删除单张参考图', () => {
    expect(() => addReferenceImage([], '不是图片地址')).toThrow(/http\(s\)/u)
    expect(removeReferenceImage(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('每个节点独立持有参考图数组，新增和删除不会污染其他节点', () => {
    const sharedInput = ['/static/uploads/source.png']
    const first = createProductionNodeData('generic-image', { parameters: { referenceImages: sharedInput } })
    const second = createProductionNodeData('generic-image', { parameters: { referenceImages: sharedInput } })

    expect(first.parameters.referenceImages).not.toBe(sharedInput)
    expect(second.parameters.referenceImages).not.toBe(sharedInput)
    expect(first.parameters.referenceImages).not.toBe(second.parameters.referenceImages)

    first.parameters.referenceImages = addReferenceImage(first.parameters.referenceImages || [], '/static/uploads/first-only.png')
    second.parameters.referenceImages = removeReferenceImage(second.parameters.referenceImages || [], '/static/uploads/source.png')

    expect(first.parameters.referenceImages).toEqual(['/static/uploads/source.png', '/static/uploads/first-only.png'])
    expect(second.parameters.referenceImages).toEqual([])
    expect(sharedInput).toEqual(['/static/uploads/source.png'])
  })

  it('画布更新只写目标节点并复制传入数组', () => {
    const first: CanvasNode = { id: 'first', type: 'canvas', position: { x: 0, y: 0 }, data: createProductionNodeData('generic-image') }
    const second: CanvasNode = { id: 'second', type: 'canvas', position: { x: 0, y: 0 }, data: createProductionNodeData('generic-image') }
    const input = ['/static/uploads/first.png']
    useCanvasStore.setState({ nodes: [first, second], edges: [], selectedNodeId: 'first' })

    useCanvasStore.getState().updateNodeData('first', { parameters: { referenceImages: input } })
    input.push('/static/uploads/late-mutation.png')

    const [updatedFirst, untouchedSecond] = useCanvasStore.getState().nodes
    expect(updatedFirst?.data.parameters.referenceImages).toEqual(['/static/uploads/first.png'])
    expect(untouchedSecond?.data.parameters.referenceImages).toBeUndefined()
    expect(updatedFirst?.data.parameters.referenceImages).not.toBe(input)
    useCanvasStore.setState({ nodes: [], edges: [], selectedNodeId: null })
  })
})
