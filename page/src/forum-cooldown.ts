import type { ReplyFailure } from '../../src/community'

const DEFAULT_MS = 60_000
// again: the forum refused once more right after the user resumed, so the notice can say the
// check did run and verification is still owed, rather than look as if the click did nothing.
export type ForumAccess = { kind: 'rate-limit' | 'challenge'; until: number; message: string; again?: boolean }
const AGAIN_MS = 30_000
let access: ForumAccess | null = null
let resumedAt = 0
const listeners = new Set<() => void>()
const justResumed = (now: number) => resumedAt > 0 && now >= resumedAt && now - resumedAt < AGAIN_MS
const changed = () => { for (const listener of listeners) listener() }
export const forumAccessState = () => access
export function onForumAccessChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function clearForumCooldown(now = Date.now()): void {
  access = null
  resumedAt = now
  changed()
}

// Whether the user may try the forum again now: a challenge on their word, a rate limit once its wait is over.
export function forumCanResume(now = Date.now()): boolean {
  return access !== null && (access.kind === 'challenge' || access.until <= now)
}

export function noteForumRefusal(message: string, now = Date.now(), failure?: { kind?: string; retryAfter?: number }): void {
  if (/Cloudflare 验证/.test(message)) {
    if (access?.kind === 'challenge') return
    access = { kind: 'challenge', message, until: 0, ...(justResumed(now) ? { again: true } : {}) }
    changed()
    return
  }
  if (access?.kind === 'challenge') return
  const match = /请 (\d+) 秒后再试/.exec(message)
  const delay = failure?.retryAfter ? failure.retryAfter * 1000 : match ? Number(match[1]) * 1000 : DEFAULT_MS
  if (!match && failure?.kind !== 'rate-limit' && !/请求过于频繁|暂时拦住了/.test(message)) return
  const until = now + delay
  if (access && access.until >= until) return
  access = { kind: 'rate-limit', until, message, ...(justResumed(now) ? { again: true } : {}) }
  changed()
}

export function forumCooldownRemaining(now = Date.now()): number {
  return access?.kind === 'challenge' ? DEFAULT_MS : Math.max(0, (access?.until ?? 0) - now)
}

// A local refusal proves the backend was never called, so a blocked send has a known outcome.
export class ForumRequestBlocked extends Error {
  readonly failure: ReplyFailure
  constructor() {
    const challenge = access?.kind === 'challenge'
    const seconds = Math.ceil(forumCooldownRemaining() / 1000)
    super(challenge ? '社区访问已暂停，请在插件登录浏览器完成验证后继续浏览'
      : seconds > 0 ? `社区正在冷却，还需等待 ${seconds} 秒` : '社区访问已暂停，请点击继续浏览')
    this.failure = { kind: challenge ? 'login' : 'rate-limit', message: this.message, ...(!challenge && seconds > 0 ? { retryAfter: seconds } : {}) }
  }
}

export function forumCoolingDown(now = Date.now()): boolean {
  return forumCooldownRemaining(now) > 0
}
