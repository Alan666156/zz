import {
  FEEDING_TAGS,
  MAX_FORMULA_ML,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_SOLID_G,
  MAX_TAGS,
  type FeedingTag,
} from '@/types/models'
import { toLocalDateString, toUtcDateString } from './date'

// 昵称/备注禁止控制字符，这是有意的安全校验
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function countChars(value: string): number {
  return Array.from(value).length
}

export function validateBabyName(raw: string, allowEmpty = false): string | null {
  const name = raw.trim()
  if (!name) {
    return allowEmpty ? null : '请输入宝宝昵称'
  }
  if (countChars(name) > MAX_NAME_LENGTH) {
    return `昵称最多 ${MAX_NAME_LENGTH} 个字符`
  }
  if (CONTROL_CHARS_RE.test(name)) {
    return '昵称包含非法字符'
  }
  return null
}

/**
 * Q-11：服务端按 UTC 今天（serverToday）判定，客户端允许 ±1 天时区容差。
 * 合法区间 [utcToday-3年-1天, utcToday+1天]。
 * 必须用 UTC 日期而非本地“今天”：UTC+14 时本地已跨天，用本地会放宽到 UTC+2 被服务端 400。
 */
export function babyBirthDateBounds(now: Date = new Date()): { min: string; max: string } {
  const utcToday = toUtcDateString(now)
  const [year, month, day] = utcToday.split('-').map((part) => Number(part))
  const minDate = new Date(Date.UTC(year - 3, month - 1, day - 1))
  const maxDate = new Date(Date.UTC(year, month - 1, day + 1))
  return { min: toUtcDateString(minDate), max: toUtcDateString(maxDate) }
}

export function validateBirthDate(value: string, now: Date = new Date()): string | null {
  if (!value) return '请选择出生日期'
  if (!DATE_RE.test(value)) return '出生日期格式不正确'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime()) || toLocalDateString(parsed) !== value) {
    return '出生日期格式不正确'
  }
  const { min, max } = babyBirthDateBounds(now)
  if (value > max) return '出生日期超出允许范围'
  if (value < min) return '暂只支持 3 岁以内的宝宝'
  return null
}

export function validateNote(raw: string): string | null {
  if (countChars(raw) > MAX_NOTE_LENGTH) {
    return `备注最多 ${MAX_NOTE_LENGTH} 个字符`
  }
  return null
}

export function validateTags(tags: FeedingTag[]): string | null {
  if (tags.length > MAX_TAGS) return `最多选择 ${MAX_TAGS} 个标签`
  if (tags.some((tag) => !FEEDING_TAGS.includes(tag))) return '标签不合法'
  return null
}

export function validateAmount(
  value: number | null,
  unit: 'ML' | 'G',
  required: boolean,
): string | null {
  if (value === null || Number.isNaN(value)) {
    return required ? '请输入用量' : null
  }
  if (value <= 0) return '用量必须大于 0'
  if (unit === 'ML' && value > MAX_FORMULA_ML) return `奶量不能超过 ${MAX_FORMULA_ML} ml`
  if (unit === 'G' && value > MAX_SOLID_G) return `辅食量不能超过 ${MAX_SOLID_G} g`
  return null
}

export function validateDuration(seconds: number, required: boolean): string | null {
  if (required && seconds <= 0) return '请先计时或至少记录 1 秒'
  if (seconds < 0 || seconds > 21600) return '时长不合法'
  return null
}
