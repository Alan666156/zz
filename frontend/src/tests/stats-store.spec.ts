import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/client'
import { putFeedingRecordCache } from '@/db'
import { useStatsStore } from '@/stores/stats'
import { todayLocalDate } from '@/utils/date'
import { buildLocalFeedingRecord } from '@/utils/feeding'
import type { TrendResult } from '@/types/models'

const apiMocks = vi.hoisted(() => ({
  fetchStatsTrend: vi.fn(),
  fetchDailyStats: vi.fn(),
}))

vi.mock('@/api/stats', () => apiMocks)

function trendResult(from: string, to: string): TrendResult {
  return {
    babyId: 'baby-1',
    from,
    to,
    granularity: 'DAY',
    cached: false,
    points: [
      {
        date: from,
        feedingCount: 2,
        totalAmountMl: 240,
        totalSolidG: 0,
        totalBreastDurationSec: 0,
        totalDurationSec: 600,
        avgDurationSec: 300,
      },
    ],
  }
}

describe('stats store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.fetchStatsTrend.mockReset()
    apiMocks.fetchDailyStats.mockReset()
  })

  it('在线时使用服务端趋势数据', async () => {
    const today = todayLocalDate()
    apiMocks.fetchStatsTrend.mockImplementation(async (_id: string, from: string, to: string) =>
      trendResult(from, to),
    )
    const store = useStatsStore()

    await store.load('baby-1', 7)

    expect(store.loading).toBe(false)
    expect(store.offline).toBe(false)
    expect(store.points[0].feedingCount).toBe(2)
    expect(store.totals.totalAmountMl).toBe(240)
    expect(store.to).toBe(today)
    expect(apiMocks.fetchStatsTrend).toHaveBeenCalledTimes(1)
  })

  it('接口失败时用 IndexedDB 缓存按同一口径计算并标记离线', async () => {
    const today = todayLocalDate()
    apiMocks.fetchStatsTrend.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
    await putFeedingRecordCache(buildLocalFeedingRecord({
      feedType: 'FORMULA',
      amountValue: 150,
      amountUnit: 'ML',
      durationSec: 300,
      startedAt: new Date().toISOString(),
    }, 'baby-1'))

    const store = useStatsStore()
    await store.load('baby-1', 7)

    expect(store.offline).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.points).toHaveLength(7)
    expect(store.points[6].date).toBe(today)
    expect(store.points[6].feedingCount).toBe(1)
    expect(store.points[6].totalAmountMl).toBe(150)
    expect(store.totals.feedingCount).toBe(1)
    expect(store.hasData).toBe(true)
    expect(store.lastError).toContain('离线数据')
  })

  it('没有缓存时仍返回补零空序列并给出空态', async () => {
    apiMocks.fetchStatsTrend.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'))
    const store = useStatsStore()

    await store.load('baby-1', 30)

    expect(store.points).toHaveLength(30)
    expect(store.hasData).toBe(false)
    expect(store.totals.feedingCount).toBe(0)
    expect(store.offline).toBe(true)
  })
})
