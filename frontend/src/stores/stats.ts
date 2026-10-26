import { defineStore } from 'pinia'
import { fetchStatsTrend } from '@/api/stats'
import { getFeedingRecordsByBabyRange } from '@/db'
import type { TrendPoint } from '@/types/models'
import { addDaysToDateString, todayLocalDate } from '@/utils/date'
import { buildTrendFromRecords, summarizeTrend, type TrendTotals } from '@/utils/stats'

export type StatsRange = 7 | 30

export const useStatsStore = defineStore('stats', {
  state: () => ({
    rangeDays: 7 as StatsRange,
    points: [] as TrendPoint[],
    from: '',
    to: '',
    currentBabyId: null as string | null,
    loading: false,
    offline: false,
    lastError: null as string | null,
    loadSeq: 0,
  }),

  getters: {
    totals(state): TrendTotals {
      return summarizeTrend(state.points)
    },
    hasData(state): boolean {
      return state.points.some((point) => point.feedingCount > 0)
    },
  },

  actions: {
    async load(babyId: string, rangeDays?: StatsRange): Promise<void> {
      if (!babyId) return
      const days = rangeDays ?? this.rangeDays
      const seq = this.loadSeq + 1
      this.loadSeq = seq
      this.currentBabyId = babyId
      this.rangeDays = days
      const to = todayLocalDate()
      const from = addDaysToDateString(to, -(days - 1))
      this.from = from
      this.to = to
      this.loading = true

      try {
        const result = await fetchStatsTrend(babyId, from, to)
        if (seq !== this.loadSeq) return
        this.points = result.points
        this.offline = false
        this.lastError = null
      } catch (error) {
        if (seq !== this.loadSeq) return
        this.offline = true
        try {
          const cached = await getFeedingRecordsByBabyRange(babyId, from, to)
          this.points = buildTrendFromRecords(cached, from, to)
        } catch {
          this.points = buildTrendFromRecords([], from, to)
        }
        if (seq !== this.loadSeq) return
        this.lastError =
          error instanceof Error && error.message
            ? `${error.message}，当前显示离线数据`
            : '统计加载失败，当前显示离线数据'
      } finally {
        if (seq === this.loadSeq) {
          this.loading = false
        }
      }
    },
  },
})
