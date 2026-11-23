import { useEffect, useRef, useState } from 'preact/hooks'
import { z } from 'zod'
import { NotificationPage, NotificationUpdate, type CommunityId, type NotificationBootstrap, type ForumAccount, type ForumNotification } from '../../src/community'
import { forumAccessState, forumCooldownRemaining, noteForumRefusal, onForumAccessChange } from './forum-cooldown'
import type { PageHost } from './host'
import { callReader, errorMessage } from './reader-client'

type Inbox = { key: string; items: ForumNotification[]; page: number; more: boolean; unread: number | null; seenId: number | null; readOnOpen: boolean; loading: boolean; error: string | null; readError: string | null; reading: string | null }
const empty = (key: string, unread: number | null): Inbox => ({ key, items: [], page: 0, more: false, unread, seenId: null, readOnOpen: false, loading: false, error: null, readError: null, reading: null })
const V2EX_INTERVAL = 3 * 60_000
const RETRY_MAX = 3 * 60_000
// Coming back to the page pulls a distant poll forward, never one that is about to run.
const RESUME_GRACE = 5_000

function messageBusClientId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function useNotifications(host: PageHost, community: CommunityId | null, account: ForumAccount | null) {
  const key = account && community ? `${community}:${account.username}` : ''
  const current = useRef(key)
  current.current = key
  const [inbox, setInbox] = useState<Inbox>(() => empty(key, account?.unreadNotifications ?? null))
  const [open, setOpen] = useState(false)
  const generation = useRef(0)
  const loading = useRef<string | null>(null)
  const reading = useRef<string | null>(null)
  const readGeneration = useRef(0)
  const failedPage = useRef(1)
  const opened = useRef(false)
  opened.current = open
  useEffect(() => {
    generation.current += 1
    loading.current = null
    reading.current = null
    readGeneration.current += 1
    setInbox(empty(key, account?.unreadNotifications ?? null))
    setOpen(false)
    return () => { generation.current += 1; readGeneration.current += 1 }
  }, [key])
  useEffect(() => {
    setInbox((before) => before.key === key ? { ...before, unread: account?.unreadNotifications ?? null } : before)
  }, [account, key])

  const load = async (page: number) => {
    if (!key || !account || loading.current === key || reading.current === key) return
    const ticket = ++generation.current
    const username = account.username
    loading.current = key
    setInbox((before) => ({ ...(before.key === key ? before : empty(key, account.unreadNotifications ?? null)), loading: true, error: null }))
    try {
      const result = NotificationPage.parse(await callReader(host, 'notifications', { account: username, page }))
      if (result.account !== username || result.page !== page) throw new Error('通知返回的账号或页码不匹配，请刷新后重试')
      if (current.current !== key || generation.current !== ticket) return
      setInbox((before) => ({ ...before, key,
        items: page === 1 ? result.items : [...new Map([...before.items, ...result.items].map((item) => [item.id, item])).values()],
        page, more: result.more, unread: result.unread, seenId: result.seenId, readOnOpen: result.readOnOpen, loading: false, error: null, readError: null }))
    } catch (error) {
      if (current.current === key && generation.current === ticket) {
        failedPage.current = page
        const message = errorMessage(error)
        noteForumRefusal('browser', message)
        setInbox((before) => ({ ...before, loading: false, error: message }))
      }
    } finally {
      if (current.current === key && generation.current === ticket) loading.current = null
    }
  }
  const markRead = async (item: ForumNotification) => {
    if (!key || !account || inbox.readOnOpen || item.read !== false || reading.current === key) return
    const ticket = ++readGeneration.current
    reading.current = key
    setInbox((before) => ({ ...before, reading: item.id, readError: null }))
    try {
      z.object({ read: z.literal(true) }).parse(await callReader(host, 'notificationRead', { account: account.username, id: item.id }))
      if (current.current !== key || readGeneration.current !== ticket) return
      setInbox((before) => {
        const counted = before.items.some((one) => one.id === item.id && one.read === false) && before.seenId !== null && Number(item.id) > before.seenId
        return { ...before, reading: null, items: before.items.map((one) => one.id === item.id ? { ...one, read: true } : one),
          unread: counted && before.unread !== null ? Math.max(0, before.unread - 1) : before.unread }
      })
    } catch (error) {
      if (current.current === key && readGeneration.current === ticket) setInbox((before) => ({ ...before, reading: null, readError: errorMessage(error) }))
    } finally {
      if (current.current === key && readGeneration.current === ticket) {
        reading.current = null
        setInbox((before) => ({ ...before, reading: null }))
      }
    }
  }
  const loadCurrent = useRef(load)
  loadCurrent.current = load
  useEffect(() => {
    if (!key || !account || !community) return
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let cursor: number | undefined
    // The stream's address, kept in memory so a poll need not fetch the home page again.
    let bootstrap: NotificationBootstrap | undefined
    let userId = account.userId
    let failures = 0
    // When the pending timer fires, and whether it is a wait after a failure that focus must not cut short.
    let due: number | null = null
    let backingOff = false
    const clientId = messageBusClientId()
    const schedule = (delay: number, afterFailure = false) => {
      clearTimeout(timer)
      due = null
      if (stopped || forumAccessState('browser')) return
      due = Date.now() + delay
      backingOff = afterFailure
      timer = setTimeout(poll, delay)
    }
    const poll = async () => {
      due = null
      if (stopped || running || document.visibilityState === 'hidden') return
      if (forumAccessState('browser')) return
      running = true
      try {
        const update = NotificationUpdate.parse(await callReader(host, 'notificationWatch', {
          account: account.username, clientId, ...(cursor !== undefined ? { cursor } : {}), ...(userId !== undefined ? { userId } : {}),
          ...(bootstrap ? { bootstrap } : {})
        }))
        if (stopped) return
        if (update.state === 'ok') {
          if (update.account.username !== account.username) return
          failures = 0
          cursor = update.cursor ?? cursor
          bootstrap = update.bootstrap ?? bootstrap
          userId = update.account.userId ?? userId
          setInbox((before) => before.key === key ? { ...before, unread: update.account.unreadNotifications ?? before.unread } : before)
          if (community === 'linuxdo' && update.changed && opened.current) void loadCurrent.current(1)
          schedule(update.interval)
        } else {
          failures += 1
          // A login answer may mean the stream's address or key went stale: read it again next time.
          if (update.state === 'login') bootstrap = undefined
          if (update.message) noteForumRefusal('browser', update.message)
          const delay = Math.max(
            update.retryAfter ? update.retryAfter * 1000 : Math.min(1000 * 2 ** Math.min(failures, 7), RETRY_MAX),
            forumCooldownRemaining('browser')
          )
          schedule(delay, true)
        }
      } catch (error) {
        if (!stopped) {
          failures += 1
          noteForumRefusal('browser', errorMessage(error))
          schedule(Math.max(Math.min(1000 * 2 ** Math.min(failures, 7), RETRY_MAX), forumCooldownRemaining('browser')), true)
        }
      } finally {
        running = false
      }
    }
    // Focus and visibility fire together. Restart a poll that stopped while hidden, or pull a long wait
    // forward; leave a poll in flight, one about to run, and a wait after a failure alone.
    const resume = () => {
      if (document.visibilityState === 'hidden' || running) return
      if (due !== null && (backingOff || due - Date.now() <= RESUME_GRACE)) return
      schedule(0)
    }
    document.addEventListener('visibilitychange', resume)
    if (community === 'linuxdo') window.addEventListener('focus', resume)
    const unsubscribe = onForumAccessChange(() => {
      if (forumAccessState('browser')) { clearTimeout(timer); due = null }
      else resume()
    })
    schedule(community === 'v2ex' ? V2EX_INTERVAL : 0)
    return () => {
      stopped = true
      unsubscribe()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      if (community === 'linuxdo') window.removeEventListener('focus', resume)
    }
  }, [account?.userId, account?.username, community, host, key])
  const visible = inbox.key === key ? inbox : empty(key, account?.unreadNotifications ?? null)
  return { ...visible, enabled: Boolean(key), open: open && Boolean(key),
    toggle: () => { if (!key) return; const next = !open; setOpen(next); if (next) void load(1) },
    close: () => setOpen(false), refresh: () => void load(1), next: () => void load(visible.page + 1), retry: () => void load(failedPage.current), markRead }
}
export type Notifications = ReturnType<typeof useNotifications>
