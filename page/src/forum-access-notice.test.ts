// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { ForumAccessNotice } from './components/ForumAccessNotice'
import { dictionary } from './dictionary'
import { clearForumCooldown, forumAccessState, noteForumRefusal } from './forum-cooldown'

let root: HTMLDivElement
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); clearForumCooldown(); root = document.createElement('div'); document.body.append(root) })
afterEach(() => { render(null, root); root.remove(); clearForumCooldown(); vi.useRealTimers() })
const mount = async () => {
  const verify = vi.fn()
  const resume = vi.fn(() => clearForumCooldown())
  await act(() => render(h(ForumAccessNotice, { scope: 'browser', words: dictionary('zh-CN'), busy: false, onVerify: verify, onResume: resume }), root))
  return { verify, resume }
}
describe('forum access notice', () => {
  it('counts down without retrying or dismissing the refusal automatically', async () => {
    const f = await mount()
    await act(() => noteForumRefusal('browser', '请求过于频繁，请 2 秒后再试'))
    expect(root.textContent).toContain('2 秒后')
    expect(root.querySelector('button')?.disabled).toBe(true)
    await act(() => { vi.advanceTimersByTime(1000) })
    expect(root.textContent).toContain('1 秒后')
    await act(() => { vi.advanceTimersByTime(1000) })
    expect(root.textContent).toContain('冷却时间已到')
    expect(root.querySelector('button')?.disabled).toBe(false)
    expect(f.resume).not.toHaveBeenCalled()
    expect(forumAccessState('browser')).not.toBeNull()
    await act(() => root.querySelector('button')?.click())
    expect(f.resume).toHaveBeenCalledTimes(1)
    expect(root.textContent).toBe('')
  })

  it('keeps verification paused until the user explicitly checks after verification', async () => {
    const f = await mount()
    await act(() => noteForumRefusal('browser', '社区要求 Cloudflare 验证'))
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
    await act(() => { vi.advanceTimersByTime(3600_000) })
    expect(root.textContent).toContain('插件登录浏览器')
    await act(() => root.querySelectorAll('button')[0]?.click())
    expect(f.verify).toHaveBeenCalledTimes(1)
    expect(forumAccessState('browser')?.kind).toBe('challenge')
    expect(f.resume).not.toHaveBeenCalled()
    await act(() => root.querySelectorAll('button')[1]?.click())
    expect(f.resume).toHaveBeenCalledTimes(1)
  })
})
