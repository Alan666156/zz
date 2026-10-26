import { afterEach, describe, expect, it, vi } from 'vitest'
import { isUuidV4, uuidV4 } from '@/utils/uuid'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uuidV4', () => {
  it('生成合法 UUID v4', () => {
    const id = uuidV4()
    expect(isUuidV4(id)).toBe(true)
    expect(id).toHaveLength(36)
    expect(id.charAt(14)).toBe('4')
    expect('89ab').toContain(id.charAt(19))
  })

  it('批量生成不重复', () => {
    const set = new Set(Array.from({ length: 300 }, () => uuidV4()))
    expect(set.size).toBe(300)
  })

  it('安全随机数不可用时抛错，不降级 Math.random（FE-09）', () => {
    vi.stubGlobal('crypto', {})
    expect(() => uuidV4()).toThrow('当前浏览器不支持安全随机数')
  })

  it('拒绝非 v4 字符串', () => {
    expect(isUuidV4('not-a-uuid')).toBe(false)
    expect(isUuidV4('5f0c2c1e-6a2b-1d3e-8f1a-2b3c4d5e6f70')).toBe(false)
  })
})
