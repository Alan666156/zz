import { describe, expect, it } from 'vitest'
import type { FeedingRecord } from '@/types/models'
import {
  buildLocalFeedingRecord,
  summarizeFeedingRecords,
  validateFeedingInput,
} from '@/utils/feeding'

function record(partial: Partial<FeedingRecord>): FeedingRecord {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    babyId: 'baby-1',
    feedType: 'BREAST',
    breastSide: 'LEFT',
    amountValue: null,
    amountUnit: null,
    durationSec: 600,
    startedAt: '2026-10-26T10:00:00+08:00',
    endedAt: '2026-10-26T10:10:00+08:00',
    recordDate: '2026-10-26',
    tzOffsetMinutes: 480,
    note: null,
    tags: null,
    revision: 1,
    createdAt: '2026-10-26T02:10:00.000Z',
    updatedAt: '2026-10-26T02:10:00.000Z',
    deletedAt: null,
    ...partial,
  }
}

describe('feeding utils', () => {
  it('四类记录校验矩阵', () => {
    expect(
      validateFeedingInput({
        feedType: 'BREAST',
        breastSide: 'LEFT',
        durationSec: 600,
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).toBeNull()

    expect(
      validateFeedingInput({
        feedType: 'BREAST',
        breastSide: null,
        durationSec: 600,
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).not.toBeNull()

    expect(
      validateFeedingInput({
        feedType: 'FORMULA',
        amountValue: 120,
        amountUnit: 'ML',
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).toBeNull()

    expect(
      validateFeedingInput({
        feedType: 'FORMULA',
        amountValue: null,
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).not.toBeNull()

    expect(
      validateFeedingInput({
        feedType: 'MIXED',
        breastSide: 'RIGHT',
        amountValue: 120,
        amountUnit: 'ML',
        durationSec: 300,
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).toBeNull()

    expect(
      validateFeedingInput({
        feedType: 'SOLID',
        amountValue: null,
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).toBeNull()

    expect(
      validateFeedingInput({
        feedType: 'SOLID',
        amountValue: 3000,
        amountUnit: 'G',
        startedAt: '2026-10-26T10:00:00+08:00',
      }),
    ).not.toBeNull()
  })

  it('buildLocalFeedingRecord 归一化字段与时区', () => {
    const now = new Date(2026, 9, 26, 10, 15, 0)
    const local = buildLocalFeedingRecord(
      {
        feedType: 'FORMULA',
        amountValue: 120,
        amountUnit: 'ML',
        startedAt: '2026-10-26T10:00:00+08:00',
        breastSide: 'LEFT',
        tags: ['SPIT_UP', 'SPIT_UP'],
      },
      'baby-1',
      now,
    )
    expect(local.revision).toBe(0)
    expect(local.breastSide).toBeNull()
    expect(local.amountValue).toBe(120)
    expect(local.amountUnit).toBe('ML')
    expect(local.recordDate).toBe('2026-10-26')
    expect(local.tags).toEqual(['SPIT_UP'])
  })

  it('每日摘要按契约口径汇总', () => {
    const summary = summarizeFeedingRecords([
      record({ id: '1', feedType: 'BREAST', durationSec: 600, startedAt: '2026-10-26T08:00:00+08:00' }),
      record({
        id: '2',
        feedType: 'FORMULA',
        breastSide: null,
        amountValue: 120,
        amountUnit: 'ML',
        durationSec: null,
      }),
      record({
        id: '3',
        feedType: 'MIXED',
        breastSide: 'RIGHT',
        amountValue: 60,
        amountUnit: 'ML',
        durationSec: 300,
        startedAt: '2026-10-26T20:30:00+08:00',
      }),
      record({
        id: '4',
        feedType: 'SOLID',
        breastSide: null,
        amountValue: 30,
        amountUnit: 'G',
        durationSec: null,
      }),
      record({ id: '5', deletedAt: '2026-10-26T00:00:00.000Z' }),
    ])

    expect(summary.feedingCount).toBe(4)
    expect(summary.byType).toEqual({ BREAST: 1, FORMULA: 1, MIXED: 1, SOLID: 1 })
    expect(summary.totalAmountMl).toBe(180)
    expect(summary.totalSolidG).toBe(30)
    expect(summary.totalDurationSec).toBe(900)
    expect(summary.totalBreastDurationSec).toBe(900)
    expect(summary.avgAmountMl).toBe(90)
    expect(summary.lastFeedingAt).toBe('2026-10-26T20:30:00+08:00')
  })
})
