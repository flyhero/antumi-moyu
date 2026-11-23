import type { ReplyFailure } from '../../src/community'

const DEFAULT_MS = 60_000
const AGAIN_MS = 30_000

// Two roads to a forum, paused apart. browser: the plugin's sign-in browser (checking the account,
// signed-in reading, replies, likes, notifications). public: anonymous reading, from the backend
// straight to the forum's open endpoints. A refusal on one road never stops the other, so a reader
// who is not signed in is never held up by a challenge only the sign-in browser met.
export type ForumScope = 'browser' | 'public'
// again: the forum refused once more right after the user resumed, so the notice can say the
// check did run and verification is still owed, rather than look as if the click did nothing.
export type ForumAccess = { kind: 'rate-limit' | 'challenge'; until: number; message: string; again?: boolean }
const access: Record<ForumScope, ForumAccess | null> = { browser: null, public: null }
const resumedAt: Record<ForumScope, number> = { browser: 0, public: 0 }
const listeners = new Set<() => void>()
const justResumed = (scope: ForumScope, now: number) => resumedAt[scope] > 0 && now >= resumedAt[scope] && now - resumedAt[scope] < AGAIN_MS
const changed = () => { for (const listener of listeners) listener() }
export const forumAccessState = (scope: ForumScope) => access[scope]
export function onForumAccessChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// One road, or both when none is named.
export function clearForumCooldown(scope?: ForumScope, now = Date.now()): void {
  for (const one of scope ? [scope] : (['browser', 'public'] as const)) {
    access[one] = null
    resumedAt[one] = scope ? now : 0
  }
  changed()
}

// Whether the user may try the road again now: a challenge on their word, a rate limit once its wait is over.
export function forumCanResume(scope: ForumScope, now = Date.now()): boolean {
  const state = access[scope]
  return state !== null && (state.kind === 'challenge' || state.until <= now)
}

export function noteForumRefusal(scope: ForumScope, message: string, now = Date.now(), failure?: { kind?: string; retryAfter?: number }): void {
  const again = justResumed(scope, now) ? { again: true } : {}
  if (/Cloudflare 验证/.test(message)) {
    // Verifying in the sign-in browser cannot help the backend's anonymous requests: they wait instead.
    if (scope === 'public') {
      if (access.public && access.public.until >= now + DEFAULT_MS) return
      access.public = { kind: 'rate-limit', until: now + DEFAULT_MS, message: '社区暂时拦住了匿名访问，过一会儿再试', ...again }
      changed()
      return
    }
    if (access.browser?.kind === 'challenge') return
    access.browser = { kind: 'challenge', message, until: 0, ...again }
    changed()
    return
  }
  const current = access[scope]
  if (current?.kind === 'challenge') return
  const match = /请 (\d+) 秒后再试/.exec(message)
  const delay = failure?.retryAfter ? failure.retryAfter * 1000 : match ? Number(match[1]) * 1000 : DEFAULT_MS
  if (!match && failure?.kind !== 'rate-limit' && !/请求过于频繁|暂时拦住了/.test(message)) return
  const until = now + delay
  if (current && current.until >= until) return
  access[scope] = { kind: 'rate-limit', until, message, ...again }
  changed()
}

export function forumCooldownRemaining(scope: ForumScope, now = Date.now()): number {
  const state = access[scope]
  return state?.kind === 'challenge' ? DEFAULT_MS : Math.max(0, (state?.until ?? 0) - now)
}

// A local refusal proves the backend was never called, so a blocked send has a known outcome.
export class ForumRequestBlocked extends Error {
  readonly failure: ReplyFailure
  constructor(scope: ForumScope) {
    const challenge = access[scope]?.kind === 'challenge'
    const seconds = Math.ceil(forumCooldownRemaining(scope) / 1000)
    super(challenge ? '社区访问已暂停，请在插件登录浏览器完成验证后继续浏览'
      : seconds > 0 ? `社区正在冷却，还需等待 ${seconds} 秒` : '社区访问已暂停，请点击继续浏览')
    this.failure = { kind: challenge ? 'login' : 'rate-limit', message: this.message, ...(!challenge && seconds > 0 ? { retryAfter: seconds } : {}) }
  }
}

export function forumCoolingDown(scope: ForumScope, now = Date.now()): boolean {
  return forumCooldownRemaining(scope, now) > 0
}
