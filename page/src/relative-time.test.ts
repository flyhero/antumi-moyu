import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from './relative-time'

const now = new Date(2026, 10, 17, 21, 30).getTime()

describe('relativeTime', () => {
  it('says just now under a minute, and for a time a little ahead', () => {
    expect(relativeTime(now - 59_000, now, 'zh-CN')).toBe('刚刚')
    expect(relativeTime(now + 5000, now, 'en')).toBe('just now')
  })

  it('counts minutes, hours and days', () => {
    expect(relativeTime(now - 5 * 60_000, now, 'zh-CN')).toBe('5 分钟前')
    expect(relativeTime(now - 5 * 60_000, now, 'en')).toBe('5 min ago')
    expect(relativeTime(now - 3 * 3_600_000, now, 'zh-CN')).toBe('3 小时前')
    expect(relativeTime(now - 3 * 3_600_000, now, 'en')).toBe('3 h ago')
    expect(relativeTime(now - 86_400_000, now, 'en')).toBe('1 day ago')
    expect(relativeTime(now - 6 * 86_400_000, now, 'zh-CN')).toBe('6 天前')
  })

  it('gives the date past a week, with the year only when it differs', () => {
    expect(relativeTime(new Date(2026, 10, 3, 9, 0).getTime(), now, 'zh-CN')).toBe('11月3日')
    expect(relativeTime(new Date(2026, 10, 3, 9, 0).getTime(), now, 'en')).toBe('Nov 3')
    expect(relativeTime(new Date(2025, 0, 23).getTime(), now, 'zh-CN')).toBe('2025年1月23日')
    expect(relativeTime(new Date(2025, 0, 23).getTime(), now, 'en')).toBe('Jan 23, 2025')
  })
})

describe('absoluteTime', () => {
  it('writes the local date and time, padded', () => {
    expect(absoluteTime(new Date(2026, 0, 5, 7, 3).getTime())).toBe('2026-01-05 07:03')
  })
})
