import { describe, expect, it } from 'vitest'
import type { FeedingRecord } from '@/types/models'
import {
  buildTrendFromRecords,
  enumerateDateRange,
  metricValue,
  summarizeTrend,
} from '@/utils/stats'

function record(overrides: Partial<FeedingRecord>): FeedingRecord {
  return {
    id: 'record-1',
    babyId: 'baby-1',
    feedType: 'FORMULA',
    breastSide: null,
    amountValue: 120,
    amountUnit: 'ML',
    durationSec: null,
    startedAt: '2026-10-20T08:00:00+08:00',
    endedAt: null,
    recordDate: '2026-10-20',
    tzOffsetMinutes: 480,
    note: null,
    tags: null,
    revision: 1,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('stats utils', () => {
  it('闭区间枚举日期并补零', () => {
    expect(enumerateDateRange('2026-10-20', '2026-10-22')).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ])
    expect(enumerateDateRange('2026-10-22', '2026-10-20')).toEqual([])
  })

  it('按契约口径聚合次数、奶量、辅食量与时长', () => {
    const points = buildTrendFromRecords(
      [
        record({ id: 'a', amountValue: 120, durationSec: 600 }),
        record({
          id: 'b',
          feedType: 'MIXED',
          amountValue: 80,
          durationSec: 300,
        }),
        record({
          id: 'c',
          feedType: 'BREAST',
          amountValue: null,
          amountUnit: null,
          durationSec: 600,
          recordDate: '2026-10-21',
          startedAt: '2026-10-21T08:00:00+08:00',
        }),
        record({
          id: 'd',
          feedType: 'SOLID',
          amountValue: 30,
          amountUnit: 'G',
          durationSec: null,
          recordDate: '2026-10-21',
          startedAt: '2026-10-21T12:00:00+08:00',
        }),
        record({ id: 'e', deletedAt: '2026-10-21T00:00:00.000Z' }),
      ],
      '2026-10-20',
      '2026-10-22',
    )

    expect(points).toHaveLength(3)
    expect(points[0]).toMatchObject({
      date: '2026-10-20',
      feedingCount: 2,
      totalAmountMl: 200,
      totalDurationSec: 900,
      totalBreastDurationSec: 300,
      avgDurationSec: 450,
    })
    expect(points[1]).toMatchObject({
      date: '2026-10-21',
      feedingCount: 2,
      totalAmountMl: 0,
      totalSolidG: 30,
      totalDurationSec: 600,
      totalBreastDurationSec: 600,
      avgDurationSec: 600,
    })
    expect(points[2]).toMatchObject({
      date: '2026-10-22',
      feedingCount: 0,
      totalAmountMl: 0,
      totalSolidG: 0,
      totalDurationSec: 0,
      avgDurationSec: null,
    })
  })

  it('汇总与指标取值', () => {
    const points = buildTrendFromRecords(
      [record({ durationSec: 600 }), record({ id: 'b', recordDate: '2026-10-21' })],
      '2026-10-20',
      '2026-10-21',
    )
    expect(summarizeTrend(points)).toEqual({
      feedingCount: 2,
      totalAmountMl: 240,
      totalSolidG: 0,
      totalDurationSec: 600,
      avgFeedingCount: 1,
    })
    expect(metricValue(points[0], 'count')).toBe(1)
    expect(metricValue(points[0], 'amount')).toBe(120)
    expect(metricValue(points[0], 'duration')).toBe(10)
  })
})
