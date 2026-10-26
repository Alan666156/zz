import { describe, expect, it } from 'vitest'
import {
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

  it('出生日期范围：今天到 3 年前', () => {
    const now = new Date(2026, 9, 26)
    expect(validateBirthDate('2026-10-26', now)).toBeNull()
    expect(validateBirthDate('2026-10-27', now)).not.toBeNull()
    expect(validateBirthDate('2023-10-26', now)).toBeNull()
    expect(validateBirthDate('2023-10-25', now)).not.toBeNull()
    expect(validateBirthDate('', now)).not.toBeNull()
    expect(validateBirthDate('2026-02-31', now)).not.toBeNull()
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
