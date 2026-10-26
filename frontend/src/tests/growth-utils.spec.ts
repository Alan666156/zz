import { describe, expect, it } from 'vitest'
import type { GrowthRecord } from '@/types/models'
import {
  buildGrowthTrend,
  formatGrowthMetric,
  latestGrowthRecord,
  latestGrowthValue,
  sortGrowthRecordsDesc,
  validateGrowthForm,
  validateGrowthInput,
} from '@/utils/growth'

function record(overrides: Partial<GrowthRecord>): GrowthRecord {
  return {
    id: 'record-1',
    babyId: 'baby-1',
    measuredOn: '2026-10-20',
    heightCm: 68.5,
    weightKg: 8.12,
    headCircumferenceCm: 43,
    note: null,
    revision: 1,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

const NOW = new Date('2026-10-26T12:00:00')

describe('growth utils', () => {
  it('校验范围、精度与至少一项指标', () => {
    expect(
      validateGrowthInput(
        { measuredOn: '2026-10-20', heightCm: 68.5, weightKg: 8.12, headCircumferenceCm: 43 },
        '2026-03-01',
        NOW,
      ),
    ).toBeNull()
    expect(
      validateGrowthInput(
        { measuredOn: '2026-10-20', heightCm: 150, weightKg: 0.5, headCircumferenceCm: 70 },
        '2026-03-01',
        NOW,
      ),
    ).toBeNull()
    expect(
      validateGrowthInput(
        { measuredOn: '2026-10-20', heightCm: 150.1 },
        '2026-03-01',
        NOW,
      ),
    ).toContain('身高')
    expect(
      validateGrowthInput(
        { measuredOn: '2026-10-20', weightKg: 8.123 },
        '2026-03-01',
        NOW,
      ),
    ).toContain('2 位小数')
    expect(
      validateGrowthInput(
        { measuredOn: '2026-10-20', headCircumferenceCm: 19.9 },
        '2026-03-01',
        NOW,
      ),
    ).toContain('头围')
    expect(validateGrowthInput({ measuredOn: '2026-10-20' }, '2026-03-01', NOW)).toContain(
      '至少填写',
    )
  })

  it('校验测量日期边界与备注长度', () => {
    expect(
      validateGrowthInput({ measuredOn: '2026-02-28', weightKg: 8 }, '2026-03-01', NOW),
    ).toContain('出生日期')
    // Q-11：允许 +1 天时区容差
    expect(
      validateGrowthInput({ measuredOn: '2026-10-27', weightKg: 8 }, '2026-03-01', NOW),
    ).toBeNull()
    expect(
      validateGrowthInput({ measuredOn: '2026-10-28', weightKg: 8 }, '2026-03-01', NOW),
    ).toContain('允许范围')
    expect(
      validateGrowthInput(
        { measuredOn: '2026-10-20', weightKg: 8, note: 'a'.repeat(201) },
        '2026-03-01',
        NOW,
      ),
    ).toContain('备注')
  })

  it('表单解析字符串并保留字段级错误', () => {
    const ok = validateGrowthForm(
      {
        measuredOn: '2026-10-20',
        heightCm: '68.5',
        weightKg: '8.12',
        headCircumferenceCm: '43.0',
        note: ' 社区体检 ',
      },
      '2026-03-01',
      NOW,
    )
    expect(ok.input).toEqual({
      measuredOn: '2026-10-20',
      heightCm: 68.5,
      weightKg: 8.12,
      headCircumferenceCm: 43,
      note: '社区体检',
    })

    const invalid = validateGrowthForm(
      {
        measuredOn: '2026-10-20',
        heightCm: '68.55',
        weightKg: '',
        headCircumferenceCm: '',
        note: '',
      },
      '2026-03-01',
      NOW,
    )
    expect(invalid.input).toBeNull()
    expect(invalid.errors.heightCm).toContain('1 位小数')

    const empty = validateGrowthForm(
      {
        measuredOn: '2026-10-20',
        heightCm: '',
        weightKg: '',
        headCircumferenceCm: '',
        note: '',
      },
      '2026-03-01',
      NOW,
    )
    expect(empty.errors.metrics).toContain('至少填写')
  })

  it('格式化与排序取最新值', () => {
    expect(formatGrowthMetric(68.5, 'height')).toBe('68.5 cm')
    expect(formatGrowthMetric(8.5, 'weight')).toBe('8.5 kg')
    expect(formatGrowthMetric(8.12, 'weight')).toBe('8.12 kg')
    expect(formatGrowthMetric(43, 'head')).toBe('43.0 cm')
    expect(formatGrowthMetric(null, 'height')).toBe('--')

    const records = [
      record({ id: 'old', measuredOn: '2026-10-18', weightKg: 8.0 }),
      record({ id: 'new', measuredOn: '2026-10-20', weightKg: 8.5, heightCm: null }),
      record({
        id: 'same-day-old',
        measuredOn: '2026-10-20',
        createdAt: '2026-10-20T07:00:00.000Z',
        weightKg: 8.2,
      }),
      record({ id: 'deleted', measuredOn: '2026-10-25', deletedAt: '2026-10-25T00:00:00.000Z' }),
    ]

    expect(sortGrowthRecordsDesc(records).map((item) => item.id)).toEqual([
      'new',
      'same-day-old',
      'old',
    ])
    expect(latestGrowthRecord(records)?.id).toBe('new')
    expect(latestGrowthValue(records, 'height')).toBe(68.5)
    expect(latestGrowthValue(records, 'weight')).toBe(8.5)

    expect(buildGrowthTrend(records).map((point) => point.date)).toEqual([
      '2026-10-18',
      '2026-10-20',
      '2026-10-20',
    ])
  })
})
