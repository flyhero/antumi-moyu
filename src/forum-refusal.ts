import type { HttpResponse } from './http.js'
import { z } from 'zod'

export type ForumRefusal = { kind: 'challenge' | 'rate-limit'; message: string; retryAfter?: number }
const Wait = z.object({ wait_seconds: z.number().optional(), extras: z.object({ wait_seconds: z.number().optional() }).nullish() })

// The browser bridge carries thrown errors as text. Keep the decision readable there and log
// only diagnostic headers, never the response body, cookies or notification contents.
export function forumRefusal(response: HttpResponse, now = Date.now()): ForumRefusal | null {
  const { status, headers, body } = response
  const html = headers['content-type']?.includes('text/html') || /^\s*(?:<!doctype|<html)/i.test(body)
  const challenge = headers['cf-mitigated'] === 'challenge'
    || (html && /<title[^>]*>\s*(?:Just a moment|Attention Required)/i.test(body))
    || (status >= 400 && /cf-chl-/.test(body))
  if (!challenge && status !== 429) return null
  const value = headers['retry-after']
  let wait = value && /^\d+$/.test(value) ? Number(value) : value ? Math.ceil((Date.parse(value) - now) / 1000) : NaN
  if (!Number.isFinite(wait) || wait <= 0) {
    try {
      const data = Wait.safeParse(JSON.parse(body))
      if (data.success) wait = data.data.extras?.wait_seconds ?? data.data.wait_seconds ?? NaN
    } catch { /* A proxy may return an HTML rate-limit page. */ }
  }
  const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.min(Math.ceil(wait), 86400) : undefined
  const refusal: ForumRefusal = {
    kind: challenge ? 'challenge' : 'rate-limit',
    message: challenge ? '社区要求 Cloudflare 验证，请在插件登录浏览器中完成验证后检查状态'
      : retryAfter !== undefined ? `请求过于频繁，请 ${retryAfter} 秒后再试` : '请求过于频繁，请稍后再试',
    ...(retryAfter !== undefined ? { retryAfter } : {})
  }
  console.error('[forum-refusal]', JSON.stringify({ status, kind: refusal.kind, retryAfter,
    code: headers['discourse-rate-limit-error-code']?.slice(0, 120), ray: headers['cf-ray']?.slice(0, 120) }))
  return refusal
}
