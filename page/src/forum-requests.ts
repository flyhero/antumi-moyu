import { z } from 'zod'
import { NotificationBootstrap } from '../../src/community'
import type { PageHost } from './host'
import { errorMessage } from './reader-client'
import { forumAccessState, ForumRequestBlocked, noteForumRefusal, onForumAccessChange, type ForumScope } from './forum-cooldown'

// Ordinary reads share one lane. MessageBus can hold a connection for 35 seconds, so it has its
// own lane; writes run only on their click and are never queued or retried here.
const READS = new Set(['session', 'list', 'thread', 'notifications'])
const LOCAL = new Set(['communities', 'login', 'logout'])
const ResultFailure = z.object({ failure: z.object({ kind: z.string(), message: z.string(), retryAfter: z.number().optional() }) })
const WatchFailure = z.object({ state: z.enum(['retry', 'login']), message: z.string().optional(), retryAfter: z.number().optional() })
const LongPoll = z.object({ bootstrap: NotificationBootstrap, cursor: z.number(), userId: z.number() })
// pausable: false for what a pause must not stop (the account check while signed out).
type Waiting = { key: string; scope: ForumScope; pausable: boolean; run: () => Promise<void>; reject: (error: Error) => void }

// Anonymous reading is the backend's own road to the forum; everything else goes through the sign-in browser.
function scopeOf(method: string, params: unknown): ForumScope {
  const anonymous = (method === 'list' || method === 'thread') && typeof params === 'object' && params !== null && Reflect.get(params, 'authenticated') !== true
  return anonymous ? 'public' : 'browser'
}

export function forumRequests(source: PageHost, intervalMs = 1000): { host: PageHost; dispose: () => void } {
  let linuxdo = true
  let running = false
  let closed = false
  let nextStart = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue: Waiting[] = []
  // Whether the last account check found someone signed in. Signed out, the sign-in browser is only
  // where one would sign in: its refusals are the session bar's to show and pause nothing.
  let signedIn = false
  const cancelWaiting = (error: (scope: ForumScope) => Error, scope?: ForumScope) => {
    const hit = (item: Waiting) => !scope || (item.scope === scope && item.pausable)
    const waiting = queue.filter(hit)
    queue = queue.filter((item) => !hit(item))
    if (queue.length === 0) { clearTimeout(timer); timer = undefined }
    for (const item of waiting) item.reject(error(item.scope))
  }
  const blocked = (scope: ForumScope) => new ForumRequestBlocked(scope)
  const unsubscribe = onForumAccessChange(() => {
    for (const scope of ['browser', 'public'] as const) if (forumAccessState(scope)) cancelWaiting(blocked, scope)
  })
  const drain = () => {
    if (running || closed || queue.length === 0) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    for (const scope of ['browser', 'public'] as const) if (forumAccessState(scope)) cancelWaiting(blocked, scope)
    if (queue.length === 0) return
    const delay = nextStart - Date.now()
    if (delay > 0) {
      if (timer === undefined) timer = setTimeout(() => { timer = undefined; drain() }, delay)
      return
    }
    const item = queue.shift()
    if (!item) return
    running = true
    nextStart = Date.now() + intervalMs
    void item.run().finally(() => { running = false; drain() })
  }
  const schedule = <T,>(key: string, scope: ForumScope, pausable: boolean, task: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    // Clicking A, B, C quickly only needs the running read and the newest queued destination.
    if (key === 'thread' || key === 'list') {
      const stale = queue.filter((item) => item.key === key)
      queue = queue.filter((item) => item.key !== key)
      for (const item of stale) item.reject(new Error('已取消：已切换到其他内容'))
    }
    queue.push({ key, scope, pausable, reject, run: async () => { try { resolve(await task()) } catch (error) { reject(error) } } })
    drain()
  })
  const host: PageHost = {
    ...source,
    get state() { return source.state },
    get theme() { return source.theme },
    async call<T>(method: string, params?: unknown): Promise<T> {
      if (closed) throw new Error('页面已关闭')
      if (method === 'logout') { signedIn = false; cancelWaiting(() => new Error('已退出登录'), 'browser') }
      if ((method === 'list' || method === 'thread') && typeof params === 'object' && params !== null && 'community' in params) linuxdo = params.community === 'linuxdo'
      const scope = scopeOf(method, params)
      // The account check while signed out decides nothing about access; it may always try.
      const pausable = !LOCAL.has(method) && !(method === 'session' && !signedIn)
      const paused = () => pausable && forumAccessState(scope) !== null
      const note = (message: string, failure?: { kind?: string; retryAfter?: number }) => {
        if (method === 'session' && !signedIn) return
        noteForumRefusal(scope, message, Date.now(), failure)
      }
      if (paused()) throw blocked(scope)
      const invoke = async () => {
        if (paused()) throw blocked(scope)
        try {
          const result = await source.call<T>(method, params)
          if (method === 'communities') {
            const communities = z.array(z.object({ id: z.string() })).safeParse(result)
            if (communities.success) linuxdo = communities.data.some((community) => community.id === 'linuxdo')
          } else {
            if (method === 'session') signedIn = typeof result === 'object' && result !== null
            const failed = ResultFailure.safeParse(result)
            if (failed.success) note(failed.data.failure.message, failed.data.failure)
            const watch = WatchFailure.safeParse(result)
            if (watch.success && watch.data.message) note(watch.data.message, watch.data)
          }
          return result
        } catch (error) {
          if (!(error instanceof ForumRequestBlocked)) note(errorMessage(error))
          throw error
        }
      }
      const ordinaryRead = READS.has(method) || (method === 'notificationWatch' && !LongPoll.safeParse(params).success)
      return linuxdo && ordinaryRead ? schedule(method, scope, pausable, invoke) : invoke()
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', drain)
  return { host, dispose: () => {
    closed = true
    unsubscribe()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', drain)
    cancelWaiting(() => new Error('页面已关闭'))
  } }
}
