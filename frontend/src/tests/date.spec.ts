import { describe, expect, it } from 'vitest'
import {
  calcBabyAge,
  formatClock,
  formatDuration,
  toLocalDateString,
  toOffsetISOString,
  todayUtcDate,
  tzOffsetMinutes,
} from '@/utils/date'

describe('date utils', () => {
  it('toLocalDateString 使用本地日期', () => {
    expect(toLocalDateString(new Date(2026, 0, 2))).toBe('2026-01-02')
  })

  it('todayUtcDate 使用 UTC 日期（Q-11 服务端口径）', () => {
    // UTC+8 下本地已是 10-27，但 UTC 仍是 10-26
    expect(todayUtcDate(new Date('2026-10-26T17:00:00.000Z'))).toBe('2026-10-26')
    expect(todayUtcDate(new Date('2026-10-26T23:30:00.000Z'))).toBe('2026-10-26')
    expect(todayUtcDate(new Date('2026-10-26T00:30:00.000Z'))).toBe('2026-10-26')
  })

  it('toOffsetISOString 带时区偏移且可回解析', () => {
    const date = new Date(2026, 9, 26, 14, 0, 0)
    const text = toOffsetISOString(date)
    expect(text).toMatch(/^2026-10-26T14:00:00[+-]\d{2}:\d{2}$/)
    expect(Date.parse(text)).toBe(date.getTime())
    expect(tzOffsetMinutes(date)).toBe(-date.getTimezoneOffset())
  })

  it('calcBabyAge 计算月龄与天数', () => {
    const age = calcBabyAge('2026-03-01', new Date(2026, 9, 26))
    expect(age.months).toBe(7)
    expect(age.days).toBe(25)
    expect(age.label).toBe('7 个月 25 天')
  })

  it('calcBabyAge 不足一个月显示天数', () => {
    const age = calcBabyAge('2026-10-20', new Date(2026, 9, 26))
    expect(age.months).toBe(0)
    expect(age.label).toBe('6 天')
  })

  it('formatClock / formatDuration', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(3665)).toBe('1:01:05')
    expect(formatDuration(90)).toBe('1 分 30 秒')
    expect(formatDuration(120)).toBe('2 分钟')
    expect(formatDuration(null)).toBe('')
  })
})
