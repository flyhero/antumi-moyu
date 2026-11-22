// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { clearForumCooldown, noteForumRefusal } from './forum-cooldown'
import type { PageHost } from './host'
import { focusCheckDelay, focusCheckInterval, useForumSession } from './use-forum-session'

function harness() {
  const calls = vi.fn(async (method: string) => {
    if (method === 'session') return { username: 'alice', unreadNotifications: 1 }
    throw new Error(method)
  })
  const host: PageHost = {
    async call<T>(method: string): Promise<T> { return await calls(method) as T },
    state: null, setState() {}, theme: { scheme: 'light', variables: {} }, locale: 'zh-CN', onTheme: () => () => {}, open: vi.fn(), leave: vi.fn(),
  }
  return { host, calls }
}
function sessions(calls: ReturnType<typeof harness>['calls']) {
  return calls.mock.calls.filter(([method]) => method === 'session')
}
function Probe({ host }: { host: PageHost }) {
  const session = useForumSession(host)
  return h('button', { type: 'button', onClick: () => void session.check() }, session.account?.username ?? 'none')
}

describe('forum session focus check', () => {
  let root: HTMLDivElement
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); clearForumCooldown() })
  afterEach(() => { if (root) render(null, root); clearForumCooldown(); vi.useRealTimers() })

  async function mount() {
    const built = harness()
    root = document.createElement('div')
    document.body.append(root)
    await act(async () => { render(h(Probe, { host: built.host }), root) })
    return built
  }

  it('checks once on open and ignores focus until that check is old', async () => {
    const { calls } = await mount()
    expect(sessions(calls)).toHaveLength(1)
    await act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
      vi.advanceTimersByTime(focusCheckDelay)
    })
    expect(sessions(calls)).toHaveLength(1)
  })

  it('collapses a burst of focus into one check after it settles', async () => {
    const { calls } = await mount()
    await act(() => { vi.advanceTimersByTime(focusCheckInterval) })
    await act(() => {
      window.dispatchEvent(new Event('focus'))
      vi.advanceTimersByTime(focusCheckDelay - 1)
      window.dispatchEvent(new Event('focus'))
      vi.advanceTimersByTime(focusCheckDelay - 1)
    })
    expect(sessions(calls)).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(sessions(calls)).toHaveLength(2)
  })

  it('lets a manual check run immediately and drops the pending focus check', async () => {
    const { calls } = await mount()
    await act(() => { vi.advanceTimersByTime(focusCheckInterval) })
    await act(() => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { root.querySelector('button')?.click() })
    expect(sessions(calls)).toHaveLength(2)
    await act(() => { vi.advanceTimersByTime(focusCheckInterval) })
    expect(sessions(calls)).toHaveLength(2)
  })

  it('drops a pending focus check when the page closes', async () => {
    const { calls } = await mount()
    await act(() => { vi.advanceTimersByTime(focusCheckInterval) })
    await act(() => { window.dispatchEvent(new Event('focus')) })
    await act(() => { render(null, root) })
    await act(() => { vi.advanceTimersByTime(focusCheckDelay) })
    expect(sessions(calls)).toHaveLength(1)
  })

  it('skips quiet focus checks while the forum cooldown is active', async () => {
    const { calls } = await mount()
    await act(() => { vi.advanceTimersByTime(focusCheckInterval) })
    noteForumRefusal('请求过于频繁，请 30 秒后再试', Date.now())
    await act(() => {
      window.dispatchEvent(new Event('focus'))
      vi.advanceTimersByTime(focusCheckDelay)
    })
    expect(sessions(calls)).toHaveLength(1)
  })

  it('does not recheck the account on repeated window switches within 30 seconds', async () => {
    const { calls } = await mount()
    for (let index = 0; index < 10; index++) {
      await act(() => { window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(focusCheckDelay) })
    }
    expect(sessions(calls)).toHaveLength(1)
  })
})
