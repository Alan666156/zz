import { describe, expect, it } from 'vitest'
import { shouldPrefetchChunks } from '@/router/prefetch'

describe('Tab chunk 预取门控（FIX-FE-11 / Q-24 P2）', () => {
  it('在线且网络条件良好时允许预取', () => {
    expect(shouldPrefetchChunks({ onLine: true })).toBe(true)
    expect(shouldPrefetchChunks({ connection: { effectiveType: '4g' } })).toBe(true)
  })

  it('离线 / 省流 / 2G / 3G 跳过', () => {
    expect(shouldPrefetchChunks({ onLine: false })).toBe(false)
    expect(shouldPrefetchChunks({ onLine: true, connection: { saveData: true } })).toBe(false)
    for (const effectiveType of ['slow-2g', '2g', '3g']) {
      expect(shouldPrefetchChunks({ onLine: true, connection: { effectiveType } })).toBe(false)
    }
  })

  it('拿不到 navigator 时默认不预取', () => {
    expect(shouldPrefetchChunks(null)).toBe(false)
  })
})
