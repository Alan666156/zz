import { describe, expect, it } from 'vitest'
import {
  babyBirthDateBounds,
  validateAmount,
  validateBabyName,
  validateBirthDate,
  validateDuration,
  validateNote,
  validateTags,
} from '@/utils/validation'

/** 对 YYYY-MM-DD 做 UTC 日历加减，测试内推导期望值，不依赖运行机器时区 */
function utcShift(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('validation', () => {
  it('昵称 1-20 个 Unicode 字符', () => {
    expect(validateBabyName('')).not.toBeNull()
    expect(validateBabyName('   ')).not.toBeNull()
    expect(validateBabyName('小满')).toBeNull()
    expect(validateBabyName('a'.repeat(20))).toBeNull()
    expect(validateBabyName('a'.repeat(21))).not.toBeNull()
    // 20 个 emoji 应按 Unicode 字符计数
    expect(validateBabyName('😀'.repeat(20))).toBeNull()
    expect(validateBabyName('😀'.repeat(21))).not.toBeNull()
    expect(validateBabyName('a\u0000b')).not.toBeNull()
  })

  it('出生日期范围：UTC 今天 ±1 天容差，最早 3 年 1 天前（Q-11）', () => {
    const now = new Date('2026-10-26T12:00:00.000Z')
    expect(validateBirthDate('2026-10-26', now)).toBeNull()
    // 客户端允许 +1 天时区容差
    expect(validateBirthDate('2026-10-27', now)).toBeNull()
    expect(validateBirthDate('2026-10-28', now)).not.toBeNull()
    expect(validateBirthDate('2023-10-26', now)).toBeNull()
    expect(validateBirthDate('2023-10-25', now)).toBeNull()
    expect(validateBirthDate('2023-10-24', now)).not.toBeNull()
    expect(validateBirthDate('', now)).not.toBeNull()
    expect(validateBirthDate('2026-02-31', now)).not.toBeNull()
  })

  it('UTC+8 本地已跨天时，上限仍由 UTC 今天推导（Q-11）', () => {
    // 该时刻在 UTC 是 10-26，在 UTC+8 本地已是 10-27
    const now = new Date('2026-10-26T17:00:00.000Z')
    const utcToday = now.toISOString().slice(0, 10)

    const expectedMax = utcShift(utcToday, 1)
    const expectedMin = (() => {
      const date = new Date(`${utcToday}T00:00:00.000Z`)
      date.setUTCFullYear(date.getUTCFullYear() - 3)
      date.setUTCDate(date.getUTCDate() - 1)
      return date.toISOString().slice(0, 10)
    })()

    expect(babyBirthDateBounds(now)).toEqual({ min: expectedMin, max: expectedMax })
    expect(validateBirthDate(expectedMax, now)).toBeNull()
    // 若误用本地今天会放行到 UTC+2 天，服务端将返回 400
    expect(validateBirthDate(utcShift(utcToday, 2), now)).not.toBeNull()
  })

  it('本地日期被人为放大一天时，上限不跟随本地（Q-11）', () => {
    const now = new Date('2026-10-26T16:30:00.000Z')
    Object.defineProperty(now, 'getFullYear', { value: () => 2026 })
    Object.defineProperty(now, 'getMonth', { value: () => 9 })
    Object.defineProperty(now, 'getDate', { value: () => 27 })

    const utcToday = now.toISOString().slice(0, 10)
    expect(babyBirthDateBounds(now).max).toBe(utcShift(utcToday, 1))
    expect(validateBirthDate(utcShift(utcToday, 2), now)).not.toBeNull()
  })

  it('备注/标签/数值/时长边界', () => {
    expect(validateNote('a'.repeat(200))).toBeNull()
    expect(validateNote('a'.repeat(201))).not.toBeNull()
    expect(validateTags(['SPIT_UP', 'REFUSED'])).toBeNull()
    expect(validateAmount(120, 'ML', true)).toBeNull()
    expect(validateAmount(0, 'ML', true)).not.toBeNull()
    expect(validateAmount(501, 'ML', true)).not.toBeNull()
    expect(validateAmount(2001, 'G', true)).not.toBeNull()
    expect(validateAmount(null, 'G', false)).toBeNull()
    expect(validateDuration(0, true)).not.toBeNull()
    expect(validateDuration(1, true)).toBeNull()
    expect(validateDuration(21601, false)).not.toBeNull()
  })
})
