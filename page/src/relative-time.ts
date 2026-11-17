import type { PageHost } from './host'

type Locale = PageHost['locale']

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// As Antumi's conversation list says it: "5 分钟前", whole words, and a date past a week.
export function relativeTime(at: number, now: number, locale: Locale): string {
  const ago = Math.max(0, now - at)
  const zh = locale === 'zh-CN'
  if (ago < MINUTE) return zh ? '刚刚' : 'just now'
  if (ago < HOUR) {
    const minutes = Math.floor(ago / MINUTE)
    return zh ? `${minutes} 分钟前` : `${minutes} min ago`
  }
  if (ago < DAY) {
    const hours = Math.floor(ago / HOUR)
    return zh ? `${hours} 小时前` : `${hours} h ago`
  }
  if (ago < 7 * DAY) {
    const days = Math.floor(ago / DAY)
    return zh ? `${days} 天前` : days === 1 ? '1 day ago' : `${days} days ago`
  }
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  if (zh) return sameYear ? `${month + 1}月${day}日` : `${date.getFullYear()}年${month + 1}月${day}日`
  return sameYear ? `${MONTHS[month]} ${day}` : `${MONTHS[month]} ${day}, ${date.getFullYear()}`
}

// The full time, for a hover: the same in both languages.
export function absoluteTime(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
