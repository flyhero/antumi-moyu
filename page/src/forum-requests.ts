import { z } from 'zod'
import { NotificationBootstrap } from '../../src/community'
import type { PageHost } from './host'
import { errorMessage } from './reader-client'
import { forumAccessState, ForumRequestBlocked, noteForumRefusal, onForumAccessChange } from './forum-cooldown'

// Ordinary reads share one lane. MessageBus can hold a connection for 35 seconds, so it has its
// own lane; writes run only on their click and are never queued or retried here.
const READS = new Set(['session', 'list', 'thread', 'notifications'])
const LOCAL = new Set(['communities', 'login', 'logout'])
const ResultFailure = z.object({ failure: z.object({ kind: z.string(), message: z.string(), retryAfter: z.number().optional() }) })
const WatchFailure = z.object({ state: z.enum(['retry', 'login']), message: z.string().optional(), retryAfter: z.number().optional() })
const LongPoll = z.object({ bootstrap: NotificationBootstrap, cursor: z.number(), userId: z.number() })
type Waiting = { key: string; run: () => Promise<void>; reject: (error: Error) => void }

export function forumRequests(source: PageHost, intervalMs = 1000): { host: PageHost; dispose: () => void } {
  let linuxdo = true
  let running = false
  let closed = false
  let nextStart = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue: Waiting[] = []
  const cancelWaiting = (error: Error) => {
    clearTimeout(timer)
    timer = undefined
    const waiting = queue
    queue = []
    for (const item of waiting) item.reject(error)
  }
  const unsubscribe = onForumAccessChange(() => {
    if (forumAccessState()) cancelWaiting(new ForumRequestBlocked())
  })
  const drain = () => {
    if (running || closed || queue.length === 0) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (forumAccessState()) { cancelWaiting(new ForumRequestBlocked()); return }
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
  const schedule = <T,>(key: string, task: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    // Clicking A, B, C quickly only needs the running read and the newest queued destination.
    if (key === 'thread' || key === 'list') {
      const stale = queue.filter((item) => item.key === key)
      queue = queue.filter((item) => item.key !== key)
      for (const item of stale) item.reject(new Error('已取消：已切换到其他内容'))
    }
    queue.push({ key, reject, run: async () => { try { resolve(await task()) } catch (error) { reject(error) } } })
    drain()
  })
  const host: PageHost = {
    ...source,
    get state() { return source.state },
    get theme() { return source.theme },
    async call<T>(method: string, params?: unknown): Promise<T> {
      if (closed) throw new Error('页面已关闭')
      if (method === 'logout') cancelWaiting(new Error('已退出登录'))
      if ((method === 'list' || method === 'thread') && typeof params === 'object' && params !== null && 'community' in params) linuxdo = params.community === 'linuxdo'
      if (!LOCAL.has(method) && forumAccessState()) throw new ForumRequestBlocked()
      const invoke = async () => {
        if (!LOCAL.has(method) && forumAccessState()) throw new ForumRequestBlocked()
        try {
          const result = await source.call<T>(method, params)
          if (method === 'communities') {
            const communities = z.array(z.object({ id: z.string() })).safeParse(result)
            if (communities.success) linuxdo = communities.data.some((community) => community.id === 'linuxdo')
          } else {
            const failed = ResultFailure.safeParse(result)
            if (failed.success) noteForumRefusal(failed.data.failure.message, Date.now(), failed.data.failure)
            const watch = WatchFailure.safeParse(result)
            if (watch.success && watch.data.message) noteForumRefusal(watch.data.message, Date.now(), watch.data)
          }
          return result
        } catch (error) {
          if (!(error instanceof ForumRequestBlocked)) noteForumRefusal(errorMessage(error))
          throw error
        }
      }
      const ordinaryRead = READS.has(method) || (method === 'notificationWatch' && !LongPoll.safeParse(params).success)
      return linuxdo && ordinaryRead ? schedule(method, invoke) : invoke()
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', drain)
  return { host, dispose: () => {
    closed = true
    unsubscribe()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', drain)
    cancelWaiting(new Error('页面已关闭'))
  } }
}
