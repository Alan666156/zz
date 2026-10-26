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

  it('UTC+14 等本地已跨天时，上限仍按 UTC 今天计算（Q-11）', () => {
    // UTC 日期 2026-10-26，但模拟本地日期已是 2026-10-27
    const now = new Date('2026-10-26T20:00:00.000Z')
    Object.defineProperty(now, 'getFullYear', { value: () => 2026 })
    Object.defineProperty(now, 'getMonth', { value: () => 9 })
    Object.defineProperty(now, 'getDate', { value: () => 27 })

    expect(babyBirthDateBounds(now)).toEqual({ min: '2023-10-25', max: '2026-10-27' })
    expect(validateBirthDate('2026-10-27', now)).toBeNull()
    // 若误用本地今天会放宽到 10-28，服务端将返回 400
    expect(validateBirthDate('2026-10-28', now)).not.toBeNull()
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
