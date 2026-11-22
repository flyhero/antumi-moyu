// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageHost } from './host'
import { forumRequests } from './forum-requests'
import { clearForumCooldown, forumAccessState, ForumRequestBlocked, noteForumRefusal } from './forum-cooldown'

const disposers: (() => void)[] = []
function fixture(answer: (method: string, params?: unknown) => Promise<unknown> = async () => ({})) {
  const calls = vi.fn(answer)
  let state: unknown = null
  const source: PageHost = {
    async call<T>(method: string, params?: unknown): Promise<T> { return JSON.parse(JSON.stringify(await calls(method, params))) },
    get state() { return state }, setState(value) { state = value },
    theme: { scheme: 'light', variables: {} }, locale: 'zh-CN', onTheme: () => () => {}, open() {}, leave() {}
  }
  const client = forumRequests(source)
  disposers.push(client.dispose)
  return { ...client, calls }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); clearForumCooldown() })
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); clearForumCooldown(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('shared forum requests', () => {
  it('paces ordinary reads together rather than one allowance per method', async () => {
    const f = fixture()
    const first = f.host.call('list')
    const second = f.host.call('thread')
    const third = f.host.call('session')
    await first
    expect(f.calls.mock.calls.map(([method]) => method)).toEqual(['list'])
    await vi.advanceTimersByTimeAsync(999)
    expect(f.calls).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); await second
    expect(f.calls.mock.calls.map(([method]) => method)).toEqual(['list', 'thread'])
    await vi.advanceTimersByTimeAsync(1000); await third
    expect(f.calls.mock.calls.map(([method]) => method)).toEqual(['list', 'thread', 'session'])
  })

  it('drops superseded queued topic reads while keeping the running read', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    const f = fixture(async (method, params) => { if (method === 'list') await held; return params ?? {} })
    const first = f.host.call('list')
    const stale = f.host.call('thread', { id: 'A' }).catch((error: Error) => error.message)
    const latest = f.host.call('thread', { id: 'B' })
    expect(await stale).toContain('已取消')
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.calls).toHaveBeenCalledTimes(1)
    release(); await first; await vi.advanceTimersByTimeAsync(0)
    expect(await latest).toEqual({ id: 'B' })
    expect(f.calls.mock.calls).toEqual([['list', undefined], ['thread', { id: 'B' }]])
  })

  it('does not put a long notification poll in front of a topic read', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    const f = fixture(async (method) => { if (method === 'notificationWatch') await held; return {} })
    const watch = f.host.call('notificationWatch', { bootstrap: { origin: 'https://ping.linux.do', path: '/', interval: 3000 }, cursor: 90, userId: 7 })
    await f.host.call('thread')
    expect(f.calls.mock.calls.map(([method]) => method)).toEqual(['notificationWatch', 'thread'])
    release(); await watch
  })

  it('paces notification bootstrap with ordinary reads before it has a long-poll address', async () => {
    const f = fixture()
    await f.host.call('list')
    const bootstrap = f.host.call('notificationWatch', { userId: 7 })
    expect(f.calls).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await bootstrap
    expect(f.calls.mock.calls.map(([method]) => method)).toEqual(['list', 'notificationWatch'])
  })

  it('cancels queued work on refusal and requires manual resume even after the cooldown expires', async () => {
    const f = fixture(async (method) => { if (method === 'list') throw new Error('请求过于频繁，请 15 秒后再试'); return {} })
    const failed = f.host.call('list').catch((error: Error) => error.message)
    const queued = f.host.call('thread').catch((error) => error)
    expect(await failed).toContain('15 秒')
    expect(await queued).toBeInstanceOf(ForumRequestBlocked)
    await vi.advanceTimersByTimeAsync(60_000)
    for (const method of ['thread', 'session', 'notificationWatch', 'reply', 'like', 'upload', 'notificationRead']) {
      await expect(f.host.call(method)).rejects.toBeInstanceOf(ForumRequestBlocked)
    }
    expect(f.calls).toHaveBeenCalledTimes(1)
    clearForumCooldown()
    await f.host.call('thread')
    expect(f.calls).toHaveBeenCalledTimes(2)
  })

  it('keeps the browser verification entry available while pausing all forum traffic', async () => {
    const f = fixture()
    noteForumRefusal('社区要求 Cloudflare 验证')
    await vi.advanceTimersByTimeAsync(86400_000)
    await expect(f.host.call('session')).rejects.toBeInstanceOf(ForumRequestBlocked)
    await f.host.call('login')
    await f.host.call('logout')
    expect(f.calls.mock.calls.map(([method]) => method)).toEqual(['login', 'logout'])
    expect(forumAccessState()?.kind).toBe('challenge')
  })

  it('observes structured failures without retrying a write or losing the advertised wait', async () => {
    const f = fixture(async () => ({ state: 'failed', failure: { kind: 'rate-limit', message: 'Slow down', retryAfter: 13 } }))
    expect(await f.host.call('reply')).toMatchObject({ state: 'failed' })
    expect(forumAccessState()).toMatchObject({ kind: 'rate-limit', until: 13_000 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(f.calls).toHaveBeenCalledTimes(1)
  })

  it('leaves V2EX reads unpaced and keeps the host state getter live', async () => {
    const f = fixture(async (method) => method === 'communities' ? [{ id: 'v2ex' }] : {})
    await f.host.call('communities')
    await Promise.all([f.host.call('thread'), f.host.call('session'), f.host.call('notifications')])
    expect(f.calls).toHaveBeenCalledTimes(4)
    f.host.setState({ draft: 'saved' })
    expect(f.host.state).toEqual({ draft: 'saved' })
  })

  it('cancels waiting reads when the page closes', async () => {
    const f = fixture()
    await f.host.call('list')
    const queued = f.host.call('thread').catch((error: Error) => error.message)
    f.dispose()
    expect(await queued).toBe('页面已关闭')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.calls).toHaveBeenCalledTimes(1)
  })

  it('keeps queued reads quiet while hidden and starts them only when visible again', async () => {
    const f = fixture()
    await f.host.call('list')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const queued = f.host.call('thread')
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.calls).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await queued
    expect(f.calls).toHaveBeenCalledTimes(2)
  })
})
