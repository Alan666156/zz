import type { FeedingRecord, StatsMetric, TrendPoint } from '@/types/models'
import { addDaysToDateString } from './date'

export interface TrendTotals {
  feedingCount: number
  totalAmountMl: number
  totalSolidG: number
  totalDurationSec: number
  avgFeedingCount: number
}

/** 闭区间日期列表（含首尾） */
export function enumerateDateRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const dates: string[] = []
  let cursor = from
  let guard = 0
  while (cursor <= to && guard < 400) {
    dates.push(cursor)
    cursor = addDaysToDateString(cursor, 1)
    guard += 1
  }
  return dates
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * 离线统计：与契约 §4.7 同口径按 recordDate 聚合，缺失日期补零。
 */
export function buildTrendFromRecords(
  records: FeedingRecord[],
  from: string,
  to: string,
): TrendPoint[] {
  const dates = enumerateDateRange(from, to)
  const map = new Map<string, TrendPoint>()
  for (const date of dates) {
    map.set(date, {
      date,
      feedingCount: 0,
      totalAmountMl: 0,
      totalSolidG: 0,
      totalBreastDurationSec: 0,
      totalDurationSec: 0,
      avgDurationSec: null,
    })
  }

  const durationCounts = new Map<string, number>()
  for (const record of records) {
    if (record.deletedAt) continue
    const point = map.get(record.recordDate)
    if (!point) continue

    point.feedingCount += 1
    if (
      (record.feedType === 'FORMULA' || record.feedType === 'MIXED') &&
      record.amountValue !== null &&
      record.amountUnit === 'ML'
    ) {
      point.totalAmountMl += record.amountValue
    }
    if (
      record.feedType === 'SOLID' &&
      record.amountValue !== null &&
      record.amountUnit === 'G'
    ) {
      point.totalSolidG += record.amountValue
    }
    if (record.durationSec && record.durationSec > 0) {
      point.totalDurationSec += record.durationSec
      durationCounts.set(record.recordDate, (durationCounts.get(record.recordDate) ?? 0) + 1)
      if (record.feedType === 'BREAST' || record.feedType === 'MIXED') {
        point.totalBreastDurationSec += record.durationSec
      }
    }
  }

  return dates.map((date) => {
    const point = map.get(date) as TrendPoint
    const durationCount = durationCounts.get(date) ?? 0
    return {
      ...point,
      totalAmountMl: round1(point.totalAmountMl),
      totalSolidG: round1(point.totalSolidG),
      avgDurationSec:
        durationCount > 0 ? Math.round(point.totalDurationSec / durationCount) : null,
    }
  })
}

export function summarizeTrend(points: TrendPoint[]): TrendTotals {
  const totals = points.reduce(
    (acc, point) => {
      acc.feedingCount += point.feedingCount
      acc.totalAmountMl += point.totalAmountMl
      acc.totalSolidG += point.totalSolidG
      acc.totalDurationSec += point.totalDurationSec
      return acc
    },
    {
      feedingCount: 0,
      totalAmountMl: 0,
      totalSolidG: 0,
      totalDurationSec: 0,
      avgFeedingCount: 0,
    },
  )
  totals.totalAmountMl = round1(totals.totalAmountMl)
  totals.totalSolidG = round1(totals.totalSolidG)
  totals.avgFeedingCount =
    points.length > 0 ? round1(totals.feedingCount / points.length) : 0
  return totals
}

/** 图表纵轴值：次数 / 奶量 ml / 时长分钟 */
export function metricValue(point: TrendPoint, metric: StatsMetric): number {
  if (metric === 'count') return point.feedingCount
  if (metric === 'amount') return point.totalAmountMl
  return Math.round((point.totalDurationSec / 60) * 10) / 10
}

export function formatAmount(value: number): string {
  return value.toFixed(1)
}
