import { describe, expect, it } from 'vitest'
import { elapsedSeconds, formatElapsedSeconds, generationElapsedLabel } from './elapsedTime'

describe('生成耗时显示', () => {
  it('按真实起止时间计算非负秒数', () => {
    expect(elapsedSeconds('2026-09-18T00:00:00.000Z', Date.parse('2026-09-18T00:01:05.900Z'))).toBe(65)
    expect(elapsedSeconds('2026-09-18T00:00:10.000Z', Date.parse('2026-09-18T00:00:00.000Z'))).toBe(0)
  })

  it('以秒、分和小时显示经过时间', () => {
    expect(formatElapsedSeconds(9)).toBe('9 秒')
    expect(formatElapsedSeconds(65)).toBe('1 分 05 秒')
    expect(formatElapsedSeconds(3_661)).toBe('1 小时 01 分 01 秒')
  })

  it('运行中显示动态耗时，终态显示固定耗时，旧记录显示未知', () => {
    const startedAt = '2026-09-18T00:00:00.000Z'
    const finishedAt = '2026-09-18T00:01:05.900Z'
    expect(generationElapsedLabel({ startedAt, active: true }, Date.parse(finishedAt))).toBe('已生成 1 分 05 秒')
    expect(generationElapsedLabel({ startedAt, finishedAt, active: false })).toBe('耗时 1 分 05 秒')
    expect(generationElapsedLabel({ active: false })).toBe('耗时未知')
  })
})
