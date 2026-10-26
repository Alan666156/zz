import { apiGet } from './client'
import type { DailyStats, TrendResult } from '@/types/models'

export function fetchDailyStats(babyId: string, date: string): Promise<DailyStats> {
  return apiGet<DailyStats>('/stats/daily', { babyId, date })
}

export function fetchStatsTrend(
  babyId: string,
  from: string,
  to: string,
): Promise<TrendResult> {
  return apiGet<TrendResult>('/stats/trend', { babyId, from, to })
}
