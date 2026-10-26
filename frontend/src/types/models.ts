export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN'

export interface Baby {
  id: string
  name: string
  gender: Gender
  birthDate: string
  isDefault: boolean
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface BabyInput {
  id?: string
  name: string
  gender?: Gender
  birthDate: string
  isDefault?: boolean
}

export type FeedingType = 'BREAST' | 'FORMULA' | 'MIXED' | 'SOLID'
export type BreastSide = 'LEFT' | 'RIGHT' | 'BOTH'
export type AmountUnit = 'ML' | 'G'
export type FeedingTag = 'SPIT_UP' | 'REFUSED' | 'SLEEPY' | 'HICCUP' | 'OTHER'

export interface FeedingRecord {
  id: string
  babyId: string
  feedType: FeedingType
  breastSide: BreastSide | null
  amountValue: number | null
  amountUnit: AmountUnit | null
  durationSec: number | null
  startedAt: string
  endedAt: string | null
  recordDate: string
  tzOffsetMinutes: number
  note: string | null
  tags: FeedingTag[] | null
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface FeedingRecordInput {
  feedType: FeedingType
  breastSide?: BreastSide | null
  amountValue?: number | null
  amountUnit?: AmountUnit | null
  durationSec?: number | null
  startedAt: string
  endedAt?: string | null
  note?: string | null
  tags?: FeedingTag[] | null
}

export interface GrowthRecord {
  id: string
  babyId: string
  measuredOn: string
  heightCm: number | null
  weightKg: number | null
  headCircumferenceCm: number | null
  note: string | null
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface GrowthRecordInput {
  id?: string
  measuredOn: string
  heightCm?: number | null
  weightKg?: number | null
  headCircumferenceCm?: number | null
  note?: string | null
}

export type GrowthMetric = 'height' | 'weight' | 'head'

export interface GrowthTrendPoint {
  date: string
  heightCm: number | null
  weightKg: number | null
  headCircumferenceCm: number | null
}

export interface DailySummary {
  feedingCount: number
  byType: Record<FeedingType, number>
  totalAmountMl: number
  totalSolidG: number
  totalBreastDurationSec: number
  totalDurationSec: number
  avgAmountMl: number | null
  lastFeedingAt: string | null
}

export interface DailyStats {
  babyId: string
  date: string
  feedingCount: number
  byType: Record<FeedingType, number>
  totalAmountMl: number
  totalSolidG: number
  totalBreastDurationSec: number
  totalDurationSec: number
  avgAmountMl: number | null
  lastFeedingAt: string | null
  cached: boolean
}

export interface TrendPoint {
  date: string
  feedingCount: number
  totalAmountMl: number
  totalSolidG: number
  totalBreastDurationSec: number
  totalDurationSec: number
  avgDurationSec: number | null
}

export interface TrendResult {
  babyId: string
  from: string
  to: string
  granularity: 'DAY'
  points: TrendPoint[]
  cached: boolean
}

export type StatsMetric = 'count' | 'amount' | 'duration'

export type SyncEntityType = 'BABY' | 'FEEDING_RECORD' | 'GROWTH_RECORD'
export type SyncOp = 'UPSERT' | 'DELETE'

export interface OutboxItem {
  key: string
  entityType: SyncEntityType
  entityId: string
  op: SyncOp
  baseRevision: number
  data?: Record<string, unknown>
  createdAt: string
  nextRetryAt: string
  attemptCount: number
  lastError?: string
  /** REJECTED / 不可重试错误：保留本地，等待用户修改后重新入队 */
  failed?: boolean
  failedAt?: string
}

export interface MetaEntry {
  key: string
  value: unknown
  updatedAt: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  size: number
  total: number
  hasNext: boolean
}

export const FEEDING_TYPE_LABELS: Record<FeedingType, string> = {
  BREAST: '母乳',
  FORMULA: '配方奶',
  MIXED: '混合',
  SOLID: '辅食',
}

export const BREAST_SIDE_LABELS: Record<BreastSide, string> = {
  LEFT: '左侧',
  RIGHT: '右侧',
  BOTH: '双侧',
}

export const FEEDING_TAG_LABELS: Record<FeedingTag, string> = {
  SPIT_UP: '吐奶',
  REFUSED: '拒食',
  SLEEPY: '困倦',
  HICCUP: '打嗝',
  OTHER: '其他',
}

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: '男宝',
  FEMALE: '女宝',
  UNKNOWN: '未设置',
}

export const FEEDING_TAGS: FeedingTag[] = ['SPIT_UP', 'REFUSED', 'SLEEPY', 'HICCUP', 'OTHER']

export const MAX_BABIES = 5
export const MAX_NAME_LENGTH = 20
export const MAX_NOTE_LENGTH = 200
export const MAX_TAGS = 5
export const MAX_FORMULA_ML = 500
export const MAX_SOLID_G = 2000
export const MAX_DURATION_SEC = 21600
