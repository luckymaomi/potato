import { describe, expect, it } from 'vitest'
import { addReferenceImage, removeReferenceImage } from './referenceImages'

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
})
