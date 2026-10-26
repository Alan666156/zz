const DAY_MS = 24 * 60 * 60 * 1000

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地日期 YYYY-MM-DD（不是 UTC 日期） */
export function toLocalDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * UTC 日期 YYYY-MM-DD。
 * 服务端 `serverToday` 按 UTC 判定，客户端 Q-11 日期上下限必须同口径。
 */
export function toUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/** 客户端时区偏移，例如东八区 +480 */
export function tzOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset()
}

/** 带偏移的 ISO-8601，例如 2026-10-26T14:00:00+08:00 */
export function toOffsetISOString(date: Date = new Date()): string {
  const offset = tzOffsetMinutes(date)
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const offsetText = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    offsetText
  )
}

export function todayLocalDate(now: Date = new Date()): string {
  return toLocalDateString(now)
}

/** 解析 YYYY-MM-DD 为本地零点 */
export function parseLocalDate(dateText: string): Date {
  const [year, month, day] = dateText.split('-').map((part) => Number(part))
  return new Date(year, (month || 1) - 1, day || 1)
}

export function addDaysToDateString(dateText: string, days: number): string {
  const date = parseLocalDate(dateText)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

export function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months
  const year = date.getFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(year, normalizedMonth + 1, 0).getDate()
  return new Date(year, normalizedMonth, Math.min(date.getDate(), lastDay))
}

export interface BabyAge {
  months: number
  days: number
  totalDays: number
  label: string
}

/** 出生日期 -> 月龄/天数（按本地日期） */
export function calcBabyAge(birthDate: string, now: Date = new Date()): BabyAge {
  const birth = parseLocalDate(birthDate)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (Number.isNaN(birth.getTime()) || today.getTime() < birth.getTime()) {
    return { months: 0, days: 0, totalDays: 0, label: '0 天' }
  }
  const totalDays = Math.round((today.getTime() - birth.getTime()) / DAY_MS)

  let months =
    (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth())
  if (today.getDate() < birth.getDate()) {
    months -= 1
  }
  if (months < 0) {
    months = 0
  }
  const anchor = addMonthsClamped(birth, months)
  const days = Math.max(0, Math.round((today.getTime() - anchor.getTime()) / DAY_MS))

  let label: string
  if (months <= 0) {
    label = `${totalDays} 天`
  } else if (days === 0) {
    label = `${months} 个月`
  } else {
    label = `${months} 个月 ${days} 天`
  }
  return { months, days, totalDays, label }
}

/** 秒 -> 计时展示 mm:ss 或 h:mm:ss */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  }
  return `${pad2(minutes)}:${pad2(seconds)}`
}

/** ISO 时间 -> 本地 HH:mm */
export function formatTimeOfDay(isoText: string): string {
  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** ISO 时间 -> 本地 MM-DD HH:mm */
export function formatDateTime(isoText: string): string {
  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) return '--'
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}`
}

export function isToday(dateText: string, now: Date = new Date()): boolean {
  return dateText === toLocalDateString(now)
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes <= 0) return `${rest} 秒`
  if (rest === 0) return `${minutes} 分钟`
  return `${minutes} 分 ${rest} 秒`
}
