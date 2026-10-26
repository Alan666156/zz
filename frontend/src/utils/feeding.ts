import {
  type BreastSide,
  type DailySummary,
  type FeedingRecord,
  type FeedingRecordInput,
  type FeedingTag,
  type FeedingType,
} from '@/types/models'
import { toLocalDateString, toOffsetISOString, tzOffsetMinutes } from './date'
import { uuidV4 } from './uuid'
import {
  validateAmount,
  validateDuration,
  validateNote,
  validateTags,
} from './validation'

export interface NormalizedFeedingFields {
  breastSide: BreastSide | null
  amountValue: number | null
  amountUnit: 'ML' | 'G' | null
  durationSec: number | null
}

export function normalizeFeedingFields(input: FeedingRecordInput): NormalizedFeedingFields {
  switch (input.feedType) {
    case 'BREAST':
      return {
        breastSide: input.breastSide ?? null,
        amountValue: null,
        amountUnit: null,
        durationSec: input.durationSec ?? null,
      }
    case 'FORMULA':
      return {
        breastSide: null,
        amountValue: input.amountValue ?? null,
        amountUnit: 'ML',
        durationSec: input.durationSec ?? null,
      }
    case 'MIXED':
      return {
        breastSide: input.breastSide ?? null,
        amountValue: input.amountValue ?? null,
        amountUnit: 'ML',
        durationSec: input.durationSec ?? null,
      }
    case 'SOLID':
    default:
      return {
        breastSide: null,
        amountValue: input.amountValue ?? null,
        amountUnit:
          input.amountValue !== null && input.amountValue !== undefined ? 'G' : null,
        durationSec: input.durationSec ?? null,
      }
  }
}

export function validateFeedingInput(input: FeedingRecordInput): string | null {
  if (!input.startedAt) return '请选择开始时间'

  if (input.feedType === 'BREAST' || input.feedType === 'MIXED') {
    if (!input.breastSide) return '请选择母乳侧别'
    const durationError = validateDuration(input.durationSec ?? 0, true)
    if (durationError) return durationError
  }

  if (input.feedType === 'FORMULA' || input.feedType === 'MIXED') {
    const amountError = validateAmount(input.amountValue ?? null, 'ML', true)
    if (amountError) return amountError
  }

  if (input.feedType === 'SOLID') {
    const amountError = validateAmount(input.amountValue ?? null, 'G', false)
    if (amountError) return amountError
  }

  if (input.feedType === 'BREAST' && input.amountValue !== null && input.amountValue !== undefined) {
    return '母乳记录不能填写奶量'
  }

  if (input.note) {
    const noteError = validateNote(input.note)
    if (noteError) return noteError
  }

  if (input.tags) {
    const tagError = validateTags(input.tags)
    if (tagError) return tagError
  }

  return null
}

export function buildLocalFeedingRecord(
  input: FeedingRecordInput,
  babyId: string,
  now: Date = new Date(),
): FeedingRecord {
  const parsedStart = new Date(input.startedAt)
  const startDate = Number.isNaN(parsedStart.getTime()) ? now : parsedStart
  const startedAt = Number.isNaN(parsedStart.getTime())
    ? toOffsetISOString(now)
    : input.startedAt
  const fields = normalizeFeedingFields(input)
  const note = input.note?.trim() ? input.note.trim() : null
  const tags = input.tags && input.tags.length > 0 ? [...new Set(input.tags)] : null
  const timestamp = now.toISOString()

  return {
    id: uuidV4(),
    babyId,
    feedType: input.feedType,
    breastSide: fields.breastSide,
    amountValue: fields.amountValue,
    amountUnit: fields.amountUnit,
    durationSec: fields.durationSec,
    startedAt,
    endedAt: input.endedAt ?? null,
    recordDate: toLocalDateString(startDate),
    tzOffsetMinutes: tzOffsetMinutes(startDate),
    note,
    tags,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  }
}

export function toFeedingSyncData(record: FeedingRecord): Record<string, unknown> {
  return {
    babyId: record.babyId,
    ...toFeedingPatchData(record),
  }
}

/**
 * PATCH schema 不含 babyId（契约 Q-04）：body 只要出现该字段（含 null）即 400。
 */
export function toFeedingPatchData(record: FeedingRecord): Record<string, unknown> {
  return {
    feedType: record.feedType,
    breastSide: record.breastSide,
    amountValue: record.amountValue,
    amountUnit: record.amountUnit,
    durationSec: record.durationSec,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    note: record.note,
    tags: record.tags,
  }
}

export function summarizeFeedingRecords(records: FeedingRecord[]): DailySummary {
  const byType: Record<FeedingType, number> = { BREAST: 0, FORMULA: 0, MIXED: 0, SOLID: 0 }
  let totalAmountMl = 0
  let totalSolidG = 0
  let totalBreastDurationSec = 0
  let totalDurationSec = 0
  let amountSum = 0
  let amountCount = 0
  let lastFeedingAt: string | null = null
  let lastTime = Number.NEGATIVE_INFINITY

  for (const record of records) {
    if (record.deletedAt) continue
    byType[record.feedType] += 1

    if (record.feedType === 'FORMULA' || record.feedType === 'MIXED') {
      if (record.amountValue !== null && record.amountUnit === 'ML') {
        totalAmountMl += record.amountValue
        amountSum += record.amountValue
        amountCount += 1
      }
    }
    if (record.feedType === 'SOLID' && record.amountValue !== null && record.amountUnit === 'G') {
      totalSolidG += record.amountValue
    }
    if (record.durationSec && record.durationSec > 0) {
      totalDurationSec += record.durationSec
      if (record.feedType === 'BREAST' || record.feedType === 'MIXED') {
        totalBreastDurationSec += record.durationSec
      }
    }

    const parsed = Date.parse(record.startedAt)
    if (!Number.isNaN(parsed) && parsed > lastTime) {
      lastTime = parsed
      lastFeedingAt = record.startedAt
    }
  }

  const round = (value: number): number => Math.round(value * 10) / 10

  return {
    feedingCount: records.filter((record) => !record.deletedAt).length,
    byType,
    totalAmountMl: round(totalAmountMl),
    totalSolidG: round(totalSolidG),
    totalBreastDurationSec,
    totalDurationSec,
    avgAmountMl: amountCount > 0 ? round(amountSum / amountCount) : null,
    lastFeedingAt,
  }
}

export function collectTags(tags: FeedingTag[]): FeedingTag[] {
  return [...new Set(tags)]
}
