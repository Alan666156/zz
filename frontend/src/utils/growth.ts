import type {
  GrowthMetric,
  GrowthRecord,
  GrowthRecordInput,
  GrowthTrendPoint,
} from '@/types/models'
import {
  addDaysToDateString,
  parseLocalDate,
  toLocalDateString,
  todayUtcDate,
} from './date'
import { countChars } from './validation'

export const GROWTH_NOTE_MAX = 200

export type GrowthMetricField = 'heightCm' | 'weightKg' | 'headCircumferenceCm'

interface GrowthMetricRule {
  field: GrowthMetricField
  label: string
  unit: string
  min: number
  max: number
  scale: number
}

export const GROWTH_METRIC_RULES: Record<GrowthMetric, GrowthMetricRule> = {
  height: { field: 'heightCm', label: '身高', unit: 'cm', min: 20, max: 150, scale: 1 },
  weight: { field: 'weightKg', label: '体重', unit: 'kg', min: 0.5, max: 50, scale: 2 },
  head: {
    field: 'headCircumferenceCm',
    label: '头围',
    unit: 'cm',
    min: 20,
    max: 70,
    scale: 1,
  },
}

export const GROWTH_METRICS: GrowthMetric[] = ['height', 'weight', 'head']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const NUMBER_RE = /^\d+(\.\d+)?$/

export interface GrowthFormValues {
  measuredOn: string
  heightCm: string
  weightKg: string
  headCircumferenceCm: string
  note: string
}

export interface GrowthFieldErrors {
  measuredOn: string
  heightCm: string
  weightKg: string
  headCircumferenceCm: string
  note: string
  metrics: string
}

export interface GrowthFormResult {
  errors: GrowthFieldErrors
  input: GrowthRecordInput | null
}

function emptyErrors(): GrowthFieldErrors {
  return {
    measuredOn: '',
    heightCm: '',
    weightKg: '',
    headCircumferenceCm: '',
    note: '',
    metrics: '',
  }
}

function decimalPlaces(raw: string): number {
  const dot = raw.indexOf('.')
  return dot === -1 ? 0 : raw.length - dot - 1
}

function validateMetricValue(
  value: number,
  rule: GrowthMetricRule,
): string | null {
  if (!Number.isFinite(value)) return `${rule.label}格式不正确`
  if (Math.abs(value - Number(value.toFixed(rule.scale))) > 1e-9) {
    return `${rule.label}最多 ${rule.scale} 位小数`
  }
  if (value < rule.min || value > rule.max) {
    return `${rule.label}需在 ${rule.min}-${rule.max} ${rule.unit} 之间`
  }
  return null
}

function validateMeasuredOn(value: string, birthDate: string, now: Date): string | null {
  if (!value) return '请选择测量日期'
  if (!DATE_RE.test(value)) return '测量日期格式不正确'
  const parsed = parseLocalDate(value)
  if (Number.isNaN(parsed.getTime()) || toLocalDateString(parsed) !== value) {
    return '测量日期格式不正确'
  }
  // Q-11：以服务端 UTC 今天为准，允许 +1 天时区容差
  const maxDate = addDaysToDateString(todayUtcDate(now), 1)
  if (value > maxDate) return '测量日期超出允许范围'
  if (birthDate && value < birthDate) return '测量日期不能早于宝宝出生日期'
  return null
}

/** 客户端校验：与契约 §4.8 的范围/精度/至少一项保持一致 */
export function validateGrowthInput(
  input: GrowthRecordInput,
  birthDate: string,
  now: Date = new Date(),
): string | null {
  const dateError = validateMeasuredOn(input.measuredOn, birthDate, now)
  if (dateError) return dateError

  const rules = Object.values(GROWTH_METRIC_RULES)
  let hasMetric = false
  for (const rule of rules) {
    const value = input[rule.field]
    if (value === undefined || value === null) continue
    const error = validateMetricValue(value, rule)
    if (error) return error
    hasMetric = true
  }
  if (!hasMetric) return '至少填写身高、体重、头围中的一项'

  const note = input.note?.trim() ?? ''
  if (countChars(note) > GROWTH_NOTE_MAX) {
    return `备注最多 ${GROWTH_NOTE_MAX} 个字符`
  }
  return null
}

/** 表单字符串 -> 数值 + 字段级错误，供原生输入展示 */
export function validateGrowthForm(
  form: GrowthFormValues,
  birthDate: string,
  now: Date = new Date(),
): GrowthFormResult {
  const errors = emptyErrors()
  errors.measuredOn = validateMeasuredOn(form.measuredOn, birthDate, now) ?? ''

  const values: Record<GrowthMetricField, number | null> = {
    heightCm: null,
    weightKg: null,
    headCircumferenceCm: null,
  }

  for (const rule of Object.values(GROWTH_METRIC_RULES)) {
    const raw = form[rule.field].trim()
    if (!raw) continue
    if (!NUMBER_RE.test(raw)) {
      errors[rule.field] = `${rule.label}格式不正确`
      continue
    }
    if (decimalPlaces(raw) > rule.scale) {
      errors[rule.field] = `${rule.label}最多 ${rule.scale} 位小数`
      continue
    }
    const value = Number(raw)
    const valueError = validateMetricValue(value, rule)
    if (valueError) {
      errors[rule.field] = valueError
      continue
    }
    values[rule.field] = value
  }

  const note = form.note.trim()
  if (countChars(note) > GROWTH_NOTE_MAX) {
    errors.note = `备注最多 ${GROWTH_NOTE_MAX} 个字符`
  }

  if (
    values.heightCm === null &&
    values.weightKg === null &&
    values.headCircumferenceCm === null
  ) {
    errors.metrics = '至少填写身高、体重、头围中的一项'
  }

  const hasError = Object.values(errors).some(Boolean)
  if (hasError) return { errors, input: null }

  return {
    errors,
    input: {
      measuredOn: form.measuredOn,
      heightCm: values.heightCm,
      weightKg: values.weightKg,
      headCircumferenceCm: values.headCircumferenceCm,
      note: note || null,
    },
  }
}

/** 排序：measuredOn DESC, createdAt DESC, id DESC（契约 §4.8） */
export function sortGrowthRecordsDesc(records: GrowthRecord[]): GrowthRecord[] {
  return [...records]
    .filter((record) => !record.deletedAt)
    .sort((a, b) => {
      if (a.measuredOn !== b.measuredOn) return a.measuredOn < b.measuredOn ? 1 : -1
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
}

export function latestGrowthRecord(records: GrowthRecord[]): GrowthRecord | null {
  return sortGrowthRecordsDesc(records)[0] ?? null
}

/** 最新一次非空指标（latest 卡按指标分别取最新值） */
export function latestGrowthValue(
  records: GrowthRecord[],
  metric: GrowthMetric,
): number | null {
  const field = GROWTH_METRIC_RULES[metric].field
  for (const record of sortGrowthRecordsDesc(records)) {
    const value = record[field]
    if (value !== null) return value
  }
  return null
}

export function formatGrowthMetric(value: number | null, metric: GrowthMetric): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  const rule = GROWTH_METRIC_RULES[metric]
  if (metric === 'weight') {
    const fixed = value.toFixed(2)
    return `${fixed.endsWith('0') ? fixed.slice(0, -1) : fixed} ${rule.unit}`
  }
  return `${value.toFixed(1)} ${rule.unit}`
}

/** 自身趋势点：按测量日期升序，缺失指标保留 null */
export function buildGrowthTrend(records: GrowthRecord[]): GrowthTrendPoint[] {
  return [...records]
    .filter((record) => !record.deletedAt)
    .sort((a, b) => {
      if (a.measuredOn !== b.measuredOn) return a.measuredOn < b.measuredOn ? -1 : 1
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .map((record) => ({
      date: record.measuredOn,
      heightCm: record.heightCm,
      weightKg: record.weightKg,
      headCircumferenceCm: record.headCircumferenceCm,
    }))
}

export function growthMetricValue(point: GrowthTrendPoint, metric: GrowthMetric): number | null {
  return point[GROWTH_METRIC_RULES[metric].field]
}

export function toGrowthSyncData(record: GrowthRecord): Record<string, unknown> {
  return {
    babyId: record.babyId,
    measuredOn: record.measuredOn,
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    headCircumferenceCm: record.headCircumferenceCm,
    note: record.note,
  }
}
