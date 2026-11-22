// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import type { CommunityId, NotificationPage, ReplyResult, Thread, Topic } from '../../src/community'
import { App } from './components/App'
import type { PageHost } from './host'
import { readSavedState } from './saved-state'
import { focusCheckDelay } from './use-forum-session'
import { builtinCovers, coverFor } from './title-disguise'

const topic: Topic = { community: 'linuxdo', id: '42', title: 'A long topic', author: 'bob', avatar: null, channel: null, replies: 60, time: null, url: 'https://linux.do/t/topic/42' }
const another = { ...topic, id: '43', title: 'Another topic' }
const third = { ...topic, id: '44', title: 'Third topic' }
const pictured = '<p><a class="lightbox" href="https://cdn.example/original.png"><img src="https://cdn.example/thumb.png" alt="Shot" width="640" height="480"></a></p>'
let withOpening = false
function thread(one: Topic, page: number): Thread {
  const opening = withOpening && page === 1 ? { id: one.community === 'v2ex' ? one.id : '100', floor: one.community === 'v2ex' ? 0 : 1, author: 'carol', avatar: null, html: pictured, time: null, replyTo: null, likes: 2, liked: false, byAuthor: true } : null
  return { topic: one, opening, page, more: page < 3,
    posts: [page * 20 - 1, page * 20].map((floor) => ({ id: String(floor * 100), floor, author: 'bob', avatar: null, html: `<p>Reply ${floor}</p>`, time: null, replyTo: null, likes: 0, liked: false, byAuthor: false })) }
}

function fixture(initial: unknown = null, community: CommunityId = 'linuxdo') {
  let state = initial ?? { stream: false }
  let account: string | null = 'alice'
  let result: ReplyResult = { state: 'sent', message: null, location: { floor: 60 } }
  let rejectStorage = false
  let nextThreadFails = false
  let blockedReply: Promise<ReplyResult> | null = null
  let blockedSession: Promise<{ username: string; unreadNotifications: number } | null> | null = null
  let blockedNotifications: Promise<NotificationPage> | null = null
  let notificationsFailAt: number | null = null
  let readFails = false
  let unread = 3
  let notificationUsesPostId = false
  let watchUnread = unread
  let watchChanged = false
  let streamStale = false
  const notificationPage = (username: string, page = 1): NotificationPage => ({
    account: username, page, more: page === 1, unread: community === 'v2ex' ? 0 : unread, seenId: 90, readOnOpen: community === 'v2ex',
    items: [{ id: page === 1 ? '101' : '103', kind: 'reply', actor: 'bob', title: `For ${username}`, excerpt: 'A notification reply', time: null, timeLabel: null,
      read: community === 'v2ex' ? null : false, url: topic.url + '/60', target: { topic: { ...topic, community }, ...(notificationUsesPostId ? { page: 3, postId: '6000' } : { floor: 60 }) } },
      ...(page === 1 ? [{ id: '102', kind: 'other' as const, actor: null, title: 'A badge', excerpt: null, time: null, timeLabel: null, read: true,
        url: 'https://linux.do/badges/7', target: null }] : [])]
  })
  const calls = vi.fn(async (method: string, params: unknown): Promise<unknown> => {
    if (method === 'session') return blockedSession ?? (account ? { username: account, unreadNotifications: unread } : null)
    if (method === 'login') return { opened: true }
    if (method === 'logout') { account = null; return { disconnected: true } }
    if (method === 'communities') return [{ id: community, name: 'linux.do', channels: [{ id: 'latest', name: '最新' }] }]
    if (method === 'list') return [topic, another, third].map((one) => ({ ...one, community }))
    if (method === 'thread') {
      if (nextThreadFails) { nextThreadFails = false; throw new Error('Read failed') }
      const input = JSON.parse(JSON.stringify(params))
      return thread({ ...([topic, another, third].find((topic) => topic.id === input.id) ?? topic), community }, input.floor || input.tail ? 3 : input.page ?? 1)
    }
    if (method === 'reply') return blockedReply ?? result
    if (method === 'upload') return { state: 'done', markdown: '![shot|2x2](upload://abc.png)' }
    if (method === 'like') {
      const input = JSON.parse(JSON.stringify(params))
      return input.post === '1900' ? { state: 'failed', failure: { kind: 'rejected', message: 'Like refused' } } : { state: 'done', liked: input.liked, likes: null }
    }
    if (method === 'notifications') {
      const input = JSON.parse(JSON.stringify(params))
      if (blockedNotifications) { const blocked = blockedNotifications; blockedNotifications = null; return blocked }
      if (notificationsFailAt === input.page) throw new Error('Notification read failed')
      if (community === 'v2ex') unread = 0
      return notificationPage(account ?? '', input.page)
    }
    if (method === 'notificationWatch') {
      const input = JSON.parse(JSON.stringify(params))
      if (community === 'linuxdo' && streamStale && input.bootstrap) return { state: 'login', message: 'Stream address is stale' }
      return account ? { state: 'ok', account: { username: account, unreadNotifications: watchUnread, ...(community === 'linuxdo' ? { userId: 7 } : {}) },
        ...(community === 'linuxdo' ? { cursor: typeof input.cursor === 'number' ? input.cursor + (watchChanged ? 1 : 0) : 90 } : {}),
        changed: watchChanged, interval: community === 'linuxdo' ? 180000 : 180000,
        ...(community === 'linuxdo' && !input.bootstrap ? { bootstrap: { origin: 'https://ping.linux.do', path: '/', sharedKey: 'shared', interval: 180000 } } : {}) } : { state: 'login', message: 'Signed out' }
    }
    if (method === 'notificationRead') {
      if (readFails) throw new Error('Read state failed')
      unread = Math.max(0, unread - 1)
      return { read: true }
    }
    throw new Error(method)
  })
  const host: PageHost = {
    async call<T>(method: string, params?: unknown): Promise<T> { return JSON.parse(JSON.stringify(await calls(method, params))) },
    get state() { return state },
    setState(value) { if (rejectStorage) throw new Error('storage unavailable'); state = JSON.parse(JSON.stringify(value)) },
    theme: { scheme: 'light', variables: {} }, locale: 'zh-CN', onTheme: () => () => {}, open: vi.fn(), leave: vi.fn()
  }
  return { host, calls, notificationPage, useNotificationPostId: () => { notificationUsesPostId = true }, failNotificationsAt: (page: number | null) => { notificationsFailAt = page }, failRead: (value: boolean) => { readFails = value },
    staleStream: (value: boolean) => { streamStale = value },
    watch: (count: number, changed = true) => { unread = count; watchUnread = count; watchChanged = changed },
    holdNotifications: () => { const pending = { resolve: (_result: NotificationPage) => {} }; blockedNotifications = new Promise((resolve) => { pending.resolve = resolve }); return pending },
    failNextThread: () => { nextThreadFails = true }, holdReply: () => { const pending = { resolve: (_result: ReplyResult) => {} }; blockedReply = new Promise((resolve) => { pending.resolve = resolve }); return pending },
    holdSession: () => { const pending = { resolve: (_result: { username: string; unreadNotifications: number } | null) => {} }; blockedSession = new Promise((resolve) => { pending.resolve = resolve }); return pending },
    saved: () => readSavedState(state), result: (next: ReplyResult) => { result = next }, account: (next: string | null) => { account = next }, rejectStorage: () => { rejectStorage = true } }
}
let root: HTMLDivElement | null = null
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) }) }
async function mount(host: PageHost) {
  root = document.createElement('div'); document.body.append(root)
  await act(async () => { render(h(App, { host }), root ?? document.body) }); await settle(); await settle()
}
async function unmount() {
  if (root) { const old = root; await act(() => render(null, old)); old.remove(); root = null }
}
afterEach(async () => { vi.restoreAllMocks(); withOpening = false; await unmount() })
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((button) => button.textContent === text || button.getAttribute('aria-label') === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
async function click(text: string) { await act(async () => button(text).click()); await settle() }
function input(): HTMLTextAreaElement {
  const element = document.querySelector('textarea')
  if (!element) throw new Error('Missing composer')
  return element
}
async function type(text: string) {
  await act(() => { input().value = text; input().dispatchEvent(new Event('input', { bubbles: true })) })
}
async function enter(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...options })
  await act(() => { input().dispatchEvent(event) }); await settle()
  return event
}
async function openTopic(text = 'A long topic') {
  const element = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(text))
  if (!element) throw new Error('Missing topic')
  await act(async () => element.click()); await settle()
}

describe('reader sessions', () => {
  it.each<CommunityId>(['linuxdo', 'v2ex'])('sends a targeted %s reply with Enter and clears the confirmed draft', async (community) => {
    const f = fixture(null, community)
    await mount(f.host); await openTopic(); await click('回复 #19 @bob'); await type('Sent with Enter')
    expect((await enter()).defaultPrevented).toBe(true)
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toEqual([
      ['reply', { id: '42', content: 'Sent with Enter', target: { floor: 19, author: 'bob' } }]
    ])
    expect(f.saved().drafts[`${community}:alice:42`]).toBeUndefined()
    expect(input().value).toBe('')
  })

  it('uses Win/Command + Enter to replace the selection with a saved newline without sending', async () => {
    const f = fixture()
    await mount(f.host); await openTopic(); await click('回复 #19 @bob'); await type('First OLD last')
    input().setSelectionRange(6, 9)
    expect((await enter({ metaKey: true })).defaultPrevented).toBe(true)
    expect(input().value).toBe('First \n last')
    expect(input().selectionStart).toBe(7)
    expect(input().selectionEnd).toBe(7)
    expect(f.saved().drafts['linuxdo:alice:42']).toEqual({ text: 'First \n last', target: { floor: 19, author: 'bob' }, uncertain: false })
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(0)
  })

  it('respects the character limit when inserting a shortcut newline, without removing the tail', async () => {
    const f = fixture()
    await mount(f.host); await openTopic(); await type('a'.repeat(7999) + 'Z')
    input().setSelectionRange(10, 10); await enter({ metaKey: true })
    expect(input().value).toBe('a'.repeat(7999) + 'Z')
    input().setSelectionRange(10, 11); await enter({ metaKey: true })
    expect(input().value).toBe('a'.repeat(10) + '\n' + 'a'.repeat(7988) + 'Z')
    expect(f.saved().drafts['linuxdo:alice:42']?.text).toBe(input().value)
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(0)
  })

  it.each([
    { isComposing: true }, { keyCode: 229 }, { repeat: true },
    { shiftKey: true }, { ctrlKey: true }, { altKey: true }
  ])('does not send on IME, held, or other modified Enter: %j', async (options) => {
    const f = fixture()
    await mount(f.host); await openTopic(); await type('Still composing')
    const event = await enter(options)
    if (options.isComposing || options.keyCode === 229) expect(event.defaultPrevented).toBe(false)
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(0)
    expect(f.saved().drafts['linuxdo:alice:42']?.text).toBe('Still composing')
  })

  it('ignores empty Enter and prevents another keyboard send while a reply is pending', async () => {
    const f = fixture(); const pending = f.holdReply()
    await mount(f.host); await openTopic(); await type('   '); await enter()
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(0)
    await type('Send once'); await enter(); await enter(); await enter({ repeat: true })
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(1)
    await act(async () => pending.resolve({ state: 'sent', message: null })); await settle()
  })

  it('saves drafts and targets immediately and restores them after a full remount', async () => {
    const f = fixture()
    await mount(f.host); await openTopic(); await click('回复 #19 @bob'); await type('Saved across closing the page')
    await click('显示图片：关')
    expect(f.saved().drafts['linuxdo:alice:42']).toEqual({ text: 'Saved across closing the page', target: { floor: 19, author: 'bob' }, uncertain: false })
    expect(f.saved().images).toBe(true)
    await unmount(); await mount(f.host); await openTopic()
    expect(input().value).toBe('Saved across closing the page')
    expect(document.querySelector('.reply-target')?.textContent).toContain('#19 @bob')
    await click('取消指定回复')
    expect(input().value).toBe('Saved across closing the page')
  })

  it('keeps topic drafts separate and never substitutes another account’s draft', async () => {
    const f = fixture()
    await mount(f.host); await openTopic(); await type('Alice draft')
    await openTopic('Another topic'); expect(input().value).toBe('')
    await type('Second topic'); await openTopic(); expect(input().value).toBe('Alice draft')
    await unmount(); f.account('bob'); await mount(f.host); await openTopic()
    expect(input().value).toBe('')
    expect(f.saved().drafts['linuxdo:alice:42']?.text).toBe('Alice draft')
  })

  it('persists an unconfirmed send and requires checking before a manual resend', async () => {
    const f = fixture(); f.result({ state: 'failed', failure: { kind: 'unconfirmed', message: 'Unknown send outcome' } })
    await mount(f.host); await openTopic(); await type('Do not duplicate'); await click('发送回复')
    expect(button('发送回复').disabled).toBe(true)
    expect(f.saved().drafts['linuxdo:alice:42']?.uncertain).toBe(true)
    await unmount(); await mount(f.host); await openTopic()
    expect(input().value).toBe('Do not duplicate')
    expect(button('发送回复').disabled).toBe(true)
    await click('查看帖子'); expect(f.host.open).toHaveBeenCalledWith(topic.url)
    await enter()
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(1)
    await click('确认未发出，允许重发')
    expect(button('发送回复').disabled).toBe(false)
    expect(f.saved().drafts['linuxdo:alice:42']?.uncertain).toBe(false)
  })

  it('reopens a page closed mid-send with an unknown-outcome guard', async () => {
    const f = fixture(); const pending = f.holdReply()
    await mount(f.host); await openTopic(); await type('Pending across closing'); await click('发送回复')
    expect(f.saved().drafts['linuxdo:alice:42']?.uncertain).toBe(true)
    await unmount(); await mount(f.host); await openTopic()
    expect(input().value).toBe('Pending across closing')
    expect(button('发送回复').disabled).toBe(true)
    await act(async () => pending.resolve({ state: 'sent', message: null })); await settle()
    expect(input().value).toBe('Pending across closing')
    expect(f.saved().drafts['linuxdo:alice:42']?.uncertain).toBe(true)
  })

  it('opens the browser on the first login click while a focus check is still running', async () => {
    const f = fixture()
    f.account(null)
    await mount(f.host)
    const pending = f.holdSession()
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      await act(() => { vi.advanceTimersByTime(focusCheckDelay) })
      await act(() => {
        window.dispatchEvent(new Event('focus'))
        vi.advanceTimersByTime(focusCheckDelay)
      })
    } finally {
      vi.useRealTimers()
    }
    expect(f.calls.mock.calls.filter(([method]) => method === 'session')).toHaveLength(2)
    expect(button('登录').disabled).toBe(false)
    expect(button('检查登录状态').textContent).toBe('检查登录状态')
    await click('登录')
    expect(f.calls.mock.calls.filter(([method]) => method === 'login')).toHaveLength(1)
    await act(async () => { pending.resolve(null) }); await settle()
  })

  it('keeps the draft and offers sign-in when login expires', async () => {
    const f = fixture(); f.result({ state: 'failed', failure: { kind: 'login', message: 'Session expired' } })
    await mount(f.host); await openTopic(); await type('Login draft'); await click('发送回复'); await click('重新登录')
    expect(f.calls).toHaveBeenCalledWith('login', undefined)
    expect(input().value).toBe('Login draft')
  })

  it('locates a confirmed reply on its page and clears only its saved draft', async () => {
    const f = fixture()
    await mount(f.host); await openTopic(); await type('Sent'); await click('发送回复')
    expect(f.calls).toHaveBeenCalledWith('thread', expect.objectContaining({ id: '42', floor: 60 }))
    expect(document.querySelector('#floor-60[data-flash]')).not.toBeNull()
    expect(f.saved().drafts['linuxdo:alice:42']).toBeUndefined()
    expect(input().value).toBe('')
    expect(button('加载前面的回复').disabled).toBe(false)
    await click('加载前面的回复')
    expect(document.querySelector('#floor-40')).not.toBeNull()
    expect(document.querySelector('#floor-60')).not.toBeNull()
  })

  it('closes the floor jump panel when clicking elsewhere', async () => {
    const f = fixture(); await mount(f.host); await openTopic()
    const trigger = document.querySelector<HTMLElement>('.floor-jump > summary')
    const details = document.querySelector<HTMLDetailsElement>('.floor-jump')
    if (!trigger || !details) throw new Error('Missing floor jump')
    await act(() => trigger.click())
    expect(details.open).toBe(true)
    await act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
    expect(details.open).toBe(false)
  })

  it('likes a linux.do reply and takes the like back', async () => {
    const f = fixture()
    await mount(f.host); await openTopic()
    await click('给 #20 @bob 点赞')
    expect(button('取消点赞').getAttribute('aria-pressed')).toBe('true')
    expect(button('取消点赞').textContent).toBe('1')
    await click('取消点赞')
    expect(f.calls.mock.calls.filter(([method]) => method === 'like')).toEqual([
      ['like', { topic: '42', post: '2000', liked: true }], ['like', { topic: '42', post: '2000', liked: false }]
    ])
    expect(button('给 #20 @bob 点赞').textContent).toBe('')
  })

  it('asks before sending V2EX thanks, which cannot be taken back', async () => {
    const f = fixture(null, 'v2ex')
    await mount(f.host); await openTopic()
    await click('感谢 #20 @bob：花费 10 个铜币，发出后不能撤回')
    expect(f.calls.mock.calls.filter(([method]) => method === 'like')).toHaveLength(0)
    await click('再点一次发送感谢')
    expect(f.calls.mock.calls.filter(([method]) => method === 'like')).toEqual([['like', { topic: '42', post: '2000', liked: true }]])
    expect(button('已感谢').disabled).toBe(true)
  })

  it.each<CommunityId>(['linuxdo', 'v2ex'])('likes the %s opening post as the topic', async (community) => {
    withOpening = true
    const f = fixture(null, community)
    await mount(f.host); await openTopic()
    const label = community === 'v2ex' ? '感谢 #0 @carol：花费 10 个铜币，发出后不能撤回' : '给 #1 @carol 点赞'
    await click(label)
    if (community === 'v2ex') await click('再点一次发送感谢')
    expect(f.calls.mock.calls.filter(([method]) => method === 'like')).toEqual([['like', { topic: '42', post: community === 'v2ex' ? '42' : '100', liked: true, opening: true }]])
    expect(button(community === 'v2ex' ? '已感谢' : '取消点赞').textContent).toBe('3')
  })

  it('opens a picture large in the page and closes it with Esc without leaving', async () => {
    withOpening = true
    const f = fixture({ stream: false, images: true })
    await mount(f.host); await openTopic()
    const image = document.querySelector<HTMLImageElement>('img.forum-image')
    if (!image) throw new Error('Missing picture')
    await act(async () => image.click()); await settle()
    expect(document.querySelector('.image-viewer img')).not.toBeNull()
    expect(f.host.open).not.toHaveBeenCalled()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }); await settle()
    expect(document.querySelector('.image-viewer')).toBeNull()
    expect(f.host.leave).not.toHaveBeenCalled()
  })

  it('says why a like failed and keeps the heart as it was', async () => {
    const f = fixture()
    await mount(f.host); await openTopic()
    await click('给 #19 @bob 点赞')
    expect(document.body.textContent).toContain('Like refused')
    expect(button('给 #19 @bob 点赞').getAttribute('aria-pressed')).toBe('false')
  })

  it('offers no like on one\'s own reply or while signed out', async () => {
    const f = fixture(); f.account('bob')
    await mount(f.host); await openTopic()
    expect(document.querySelector('.chat-turn-like')).toBeNull()
  })

  it('reopens the topic left open, at its place, with one read and no typing out', async () => {
    const f = fixture({ stream: true })
    await mount(f.host); await openTopic('Another topic')
    expect(f.saved().opened.linuxdo).toMatchObject({ id: '43' })
    await unmount(); f.calls.mockClear()
    await mount(f.host)
    expect(f.calls.mock.calls.filter(([method]) => method === 'thread')).toEqual([['thread', { community: 'linuxdo', id: '43', page: 1, authenticated: true }]])
    expect(document.querySelector('.chat-working')).toBeNull()
    expect(document.body.textContent).toContain('Reply 20')
  })

  it('uploads a pasted picture to linux.do and puts its markdown into the draft', async () => {
    const f = fixture()
    await mount(f.host); await openTopic(); await type('Look:')
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file] } })
    await act(async () => { input().dispatchEvent(paste) }); await settle(); await settle()
    expect(paste.defaultPrevented).toBe(true)
    expect(f.calls.mock.calls.filter(([method]) => method === 'upload')).toEqual([['upload', { name: 'shot.png', type: 'image/png', data: 'AQID' }]])
    expect(input().value).toBe('Look:\n![shot|2x2](upload://abc.png)\n')
  })

  it('offers no picture upload on V2EX', async () => {
    const f = fixture(null, 'v2ex')
    await mount(f.host); await openTopic()
    expect(() => button('插入图片（也可以粘贴或拖进输入框）')).toThrow()
  })

  it('preserves the current thread when a reply awaits moderation', async () => {
    const f = fixture(); f.result({ state: 'pending', message: 'Waiting for review' })
    await mount(f.host); await openTopic(); await type('Review me'); await click('发送回复')
    expect(f.calls.mock.calls.filter(([method]) => method === 'thread')).toHaveLength(1)
    expect(document.body.textContent).toContain('Waiting for review')
    expect(f.saved().drafts['linuxdo:alice:42']).toBeUndefined()
  })

  it('opens a saved page directly and restores its offset, without reading all earlier pages', async () => {
    const f = fixture({ stream: false, positions: { 'linuxdo:alice:42': { floor: 59, page: 3, offset: -48 } } })
    await mount(f.host); await openTopic()
    expect(f.calls.mock.calls.filter(([method]) => method === 'thread')).toEqual([['thread', { community: 'linuxdo', id: '42', page: 3, authenticated: true }]])
    expect(document.querySelector('.chat-list')?.scrollTop).toBe(48)
    expect(document.querySelector('#floor-59')).not.toBeNull()
  })

  it('honors a rate-limit cooldown without automatically retrying a write', async () => {
    const f = fixture(); f.result({ state: 'failed', failure: { kind: 'rate-limit', message: 'Slow down', retryAfter: 1 } })
    await mount(f.host); await openTopic(); await type('Wait for the forum'); await click('发送回复')
    expect(button('请稍后再试').disabled).toBe(true)
    expect(input().value).toBe('Wait for the forum')
    await enter()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1050)) })
    expect(button('发送回复').disabled).toBe(false)
    expect(f.calls.mock.calls.filter(([method]) => method === 'reply')).toHaveLength(1)
  })

  it('does not erase another topic’s draft or navigate it when an earlier send completes', async () => {
    const f = fixture(); const pending = f.holdReply()
    await mount(f.host); await openTopic('Another topic'); await type('Keep B')
    await openTopic(); await type('Send A'); await click('发送回复'); await openTopic('Another topic')
    await act(async () => pending.resolve({ state: 'sent', message: null, location: { floor: 60 } })); await settle()
    expect(input().value).toBe('Keep B')
    expect(document.querySelector('.conversation-title')?.textContent).toBe('Another topic')
    expect(f.saved().drafts['linuxdo:alice:43']?.text).toBe('Keep B')
    expect(f.saved().drafts['linuxdo:alice:42']).toBeUndefined()
  })

  it('retains the new-reply destination when its first read fails and is retried', async () => {
    const f = fixture(); await mount(f.host); await openTopic(); await type('Send')
    f.failNextThread(); await click('发送回复'); await click('重试')
    const reads = f.calls.mock.calls.filter(([method]) => method === 'thread')
    expect(reads.at(-1)?.[1]).toMatchObject({ floor: 60 })
    expect(document.querySelector('#floor-60[data-flash]')).not.toBeNull()
  })

  it('flushes the last scrolled floor and its offset when the page closes', async () => {
    const f = fixture(); await mount(f.host); await openTopic()
    const list = document.querySelector('.chat-list')
    const row = document.querySelector('#floor-19')
    if (!list || !row) throw new Error('Missing reading rows')
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 600))
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -17, 600, 100))
    list.dispatchEvent(new Event('scroll'))
    await unmount()
    expect(f.saved().positions['linuxdo:alice:42']).toEqual({ floor: 19, page: 1, offset: -17 })
  })

  it('does not resurrect a sent draft when other live drafts exceed storage capacity', async () => {
    const draft = { text: 'Small saved draft', target: null, uncertain: false }
    const f = fixture({ stream: false, drafts: { 'linuxdo:alice:42': draft, 'linuxdo:alice:43': draft, 'linuxdo:alice:44': draft } })
    await mount(f.host); await openTopic(); await type('汉'.repeat(8000))
    await openTopic('Another topic'); await type('字'.repeat(8000))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('草稿暂未保存')
    await openTopic('Third topic'); await click('发送回复')
    expect(f.saved().drafts['linuxdo:alice:44']).toBeUndefined()
    await openTopic('Another topic'); expect(input().value).toBe('字'.repeat(8000))
  })

  it('shows a save failure while keeping the live draft intact', async () => {
    const f = fixture(); await mount(f.host); await openTopic(); f.rejectStorage(); await type('Still in memory')
    expect(input().value).toBe('Still in memory')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('草稿暂未保存')
  })
})

async function openNotifications() {
  const bell = document.querySelector<HTMLButtonElement>('.notification-bell')
  if (!bell) throw new Error('Missing bell')
  await act(async () => bell.click()); await settle()
}
function panel() { return document.querySelector('[data-notifications-panel]') }
async function firstNotice() {
  const item = document.querySelector<HTMLButtonElement>('.notification-open')
  if (!item) throw new Error('Missing notification')
  await act(async () => item.click()); await settle()
}
async function markNotice() {
  const item = document.querySelector<HTMLButtonElement>('.notification-mark')
  if (!item) throw new Error('Missing read control')
  await act(async () => item.click()); await settle()
}

describe('my notifications', () => {
  it('updates the linux.do badge from its notification stream without opening the list', async () => {
    const f = fixture(); f.watch(7, false); await mount(f.host)
    expect(document.querySelector('.notification-badge')?.textContent).toBe('7')
    expect(f.calls.mock.calls.filter(([method]) => method === 'notificationWatch')).toHaveLength(1)
    expect(f.calls.mock.calls.filter(([method]) => method === 'session')).toHaveLength(1)
    expect(f.calls.mock.calls.some(([method]) => method === 'notifications')).toBe(false)
  })

  function watches(f: ReturnType<typeof fixture>) {
    return f.calls.mock.calls.filter(([method]) => method === 'notificationWatch').map(([, params]) => JSON.parse(JSON.stringify(params)))
  }

  it('hands the stream address back after the first poll, and does not stack polls on a burst of focus', async () => {
    const f = fixture(); f.watch(7, false); await mount(f.host)
    expect(watches(f)).toHaveLength(1)
    expect(watches(f)[0]).not.toHaveProperty('bootstrap')
    await act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await settle(); await settle()
    expect(watches(f)).toHaveLength(2)
    expect(watches(f)[1]).toMatchObject({ cursor: 90, userId: 7, bootstrap: { origin: 'https://ping.linux.do', path: '/', sharedKey: 'shared' } })
    expect(JSON.stringify(readSavedState(f.host.state))).not.toContain('shared')
  })

  it('reads the stream address again after a refusal, and focus does not cut a failure wait short', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout')
    const f = fixture(); f.watch(7, false); await mount(f.host)
    f.staleStream(true)
    await act(() => { window.dispatchEvent(new Event('focus')) }); await settle(); await settle()
    expect(watches(f)).toHaveLength(2)
    expect(watches(f)[1]).toHaveProperty('bootstrap')
    await act(() => { window.dispatchEvent(new Event('focus')) }); await settle()
    expect(watches(f)).toHaveLength(2)
    f.staleStream(false)
    const retry = timer.mock.calls.filter(([, delay]) => delay === 2000).at(-1)?.[0]
    if (typeof retry !== 'function') throw new Error('No backoff timer')
    await act(async () => { retry() }); await settle(); await settle()
    expect(watches(f)).toHaveLength(3)
    expect(watches(f)[2]).toMatchObject({ cursor: 90 })
    expect(watches(f)[2]).not.toHaveProperty('bootstrap')
  })

  it('waits 3 minutes for V2EX and refreshes the session after focus settles', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout')
    const f = fixture(null, 'v2ex'); await mount(f.host)
    expect(f.calls.mock.calls.some(([method]) => method === 'notificationWatch')).toBe(false)
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 180000)
    timer.mockRestore()
    f.watch(8, false)
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      await act(() => { vi.advanceTimersByTime(focusCheckDelay) })
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
        await vi.advanceTimersByTimeAsync(focusCheckDelay)
      })
    } finally {
      vi.useRealTimers()
    }
    await settle()
    expect(document.querySelector('.notification-badge')?.textContent).toBe('8')
    expect(f.calls.mock.calls.filter(([method]) => method === 'notificationWatch')).toHaveLength(0)
    expect(f.calls.mock.calls.filter(([method]) => method === 'session')).toHaveLength(2)
  })

  it('refreshes an open linux.do notification list when the stream changes', async () => {
    const f = fixture(); await mount(f.host); await openNotifications()
    expect(f.calls.mock.calls.filter(([method]) => method === 'notifications')).toHaveLength(1)
    f.watch(5, true)
    await act(() => { window.dispatchEvent(new Event('focus')) }); await settle(); await settle()
    expect(document.querySelector('.notification-badge')?.textContent).toBe('5')
    expect(f.calls.mock.calls.filter(([method]) => method === 'notifications')).toHaveLength(2)
  })

  it('disables private notifications for an anonymous reader', async () => {
    const f = fixture(); f.account(null); await mount(f.host)
    expect(document.querySelector<HTMLButtonElement>('.notification-bell')?.disabled).toBe(true)
    expect(f.calls.mock.calls.some(([method]) => method === 'notifications')).toBe(false)
  })

  it('shows the account counter, fetches only on opening, and confirms a single read', async () => {
    const f = fixture(); await mount(f.host)
    expect(document.querySelector('.notification-badge')?.textContent).toBe('3')
    expect(f.calls.mock.calls.some(([method]) => method === 'notifications')).toBe(false)
    await openNotifications()
    expect(panel()?.textContent).toContain('For alice')
    await markNotice()
    expect(document.querySelector('.notification-badge')?.textContent).toBe('2')
    expect(document.querySelector('.notification-row[data-unread]')).toBeNull()
    expect(f.calls).toHaveBeenCalledWith('notificationRead', { account: 'alice', id: '101' })
  })

  it('clears the V2EX badge only after successfully viewing its notification list', async () => {
    const f = fixture(null, 'v2ex'); await mount(f.host)
    expect(document.querySelector('.notification-badge')?.textContent).toBe('3')
    await openNotifications()
    expect(document.querySelector('.notification-badge')).toBeNull()
    expect(panel()?.textContent).toContain('V2EX 查看通知列表后会清除未读计数')
    expect(document.querySelector('.notification-mark')).toBeNull()
    expect(f.calls.mock.calls.some(([method]) => method === 'notificationRead')).toBe(false)
  })

  it('retains the badge and existing rows on failure, with explicit pagination retry', async () => {
    const f = fixture(); await mount(f.host); await openNotifications(); f.failNotificationsAt(2)
    await click('加载更多通知')
    expect(panel()?.textContent).toContain('For alice')
    expect(panel()?.querySelector('[role="alert"]')?.textContent).toContain('Notification read failed')
    expect(document.querySelector('.notification-badge')?.textContent).toBe('3')
    const attempts = f.calls.mock.calls.filter(([method]) => method === 'notifications').length
    await settle(); expect(f.calls.mock.calls.filter(([method]) => method === 'notifications')).toHaveLength(attempts)
    f.failNotificationsAt(null); await click('重试')
    expect(panel()?.querySelectorAll('.notification-row')).toHaveLength(3)
    expect(f.calls).toHaveBeenLastCalledWith('notifications', { account: 'alice', page: 2 })
  })

  it('does not clear a V2EX badge if its notification request fails', async () => {
    const f = fixture(null, 'v2ex'); f.failNotificationsAt(1); await mount(f.host); await openNotifications()
    expect(document.querySelector('.notification-badge')?.textContent).toBe('3')
  })

  it('keeps an unread item and counter when marking it read fails', async () => {
    const f = fixture(); f.failRead(true); await mount(f.host); await openNotifications(); await markNotice()
    expect(document.querySelector('.notification-badge')?.textContent).toBe('3')
    expect(document.querySelector('.notification-row[data-unread]')).not.toBeNull()
    expect(panel()?.textContent).toContain('已读状态未更新')
    expect(f.calls.mock.calls.filter(([method]) => method === 'notificationRead')).toHaveLength(1)
    f.failRead(false); await markNotice()
    expect(document.querySelector('.notification-badge')?.textContent).toBe('2')
  })

  it('opens the exact reply without replacing the current draft or automatically marking it read', async () => {
    const f = fixture(); await mount(f.host); await openTopic(); await type('Keep this draft')
    await openNotifications(); await firstNotice()
    expect(panel()).toBeNull()
    expect(f.calls).toHaveBeenCalledWith('thread', expect.objectContaining({ floor: 60 }))
    expect(document.querySelector('#floor-60[data-flash]')).not.toBeNull()
    expect(input().value).toBe('Keep this draft')
    expect(f.calls.mock.calls.some(([method]) => method === 'notificationRead')).toBe(false)
  })

  it('resolves a V2EX reply id inside its supplied page without treating it as a floor', async () => {
    const f = fixture(null, 'v2ex'); f.useNotificationPostId(); await mount(f.host); await openNotifications(); await firstNotice()
    const reads = f.calls.mock.calls.filter(([method]) => method === 'thread')
    expect(reads).toEqual([['thread', { community: 'v2ex', id: '42', page: 3, authenticated: true }]])
    expect(document.querySelector('#floor-60[data-flash]')).not.toBeNull()
  })

  it('opens a non-topic notification on the official site', async () => {
    const f = fixture(); await mount(f.host); await openNotifications()
    const row = document.querySelectorAll<HTMLButtonElement>('.notification-open')[1]
    if (!row) throw new Error('Missing badge')
    await act(async () => row.click()); await settle()
    expect(f.host.open).toHaveBeenCalledWith('https://linux.do/badges/7')
    expect(f.calls.mock.calls.some(([method]) => method === 'thread')).toBe(false)
  })

  it('closes on Escape, restores bell focus, and keeps reading shortcuts out of the popup', async () => {
    const f = fixture(); await mount(f.host); await openNotifications()
    const popup = panel()
    if (!popup) throw new Error('Missing popup')
    await act(() => { popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })) })
    expect(f.calls.mock.calls.filter(([method]) => method === 'notifications')).toHaveLength(1)
    await act(() => { popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('.notification-bell'))
    expect(f.host.leave).not.toHaveBeenCalled()
  })

  it('gives the reading switches the same hint, with no browser title', async () => {
    const f = fixture(); await mount(f.host)
    const tips = [...document.querySelectorAll<HTMLButtonElement>('.reading-toggle')].map((button) => button.dataset.tooltip)
    expect(tips).toEqual(['标题伪装：关', '回复逐条打出：关', '显示图片：关', '头像伪装：关'])
    expect(document.querySelector('.reading-toggle[title]')).toBeNull()
  })

  it('shows a stand-in topic title until the row is pointed at, and keeps a custom list on its sentences', async () => {
    const f = fixture(); await mount(f.host)
    const row = () => document.querySelector<HTMLButtonElement>('[data-topic="linuxdo:42"]')
    expect(row()?.querySelector('.title-cover')).toBeNull()
    expect(row()?.textContent).toContain('A long topic')
    await click('标题伪装：关')
    expect(f.saved().disguiseTitles).toBe(true)
    expect(row()?.querySelector('.title-cover')?.textContent).toBe(coverFor('linuxdo:42', builtinCovers('zh-CN')))
    expect(row()?.getAttribute('aria-label')).toBe('A long topic')
    expect(row()?.querySelector('.title-real')?.textContent).toBe('A long topic')
    await click('编辑伪装标题')
    const field = document.querySelector<HTMLTextAreaElement>('.title-cover-field')
    if (!field) throw new Error('Missing title list')
    await act(() => {
      field.value = '看一下侧栏\n核一下发布'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    await settle()
    const custom = f.saved().titleCovers
    expect(custom).toEqual([{ id: 'u1', text: '看一下侧栏' }, { id: 'u2', text: '核一下发布' }])
    expect(f.host.leave).not.toHaveBeenCalled()
    for (const id of ['42', '43', '44']) {
      expect(document.querySelector(`[data-topic="linuxdo:${id}"] .title-cover`)?.textContent).toBe(coverFor(`linuxdo:${id}`, custom))
    }
  })

  it('disguises the open topic in the header as its list row, real title only on hover', async () => {
    const f = fixture({ stream: false, disguiseTitles: true }); await mount(f.host)
    await act(async () => document.querySelector<HTMLButtonElement>('[data-topic="linuxdo:42"]')?.click()); await settle()
    const header = document.querySelector('.chat-header .conversation-title')
    const cover = coverFor('linuxdo:42', builtinCovers('zh-CN'))
    expect(header?.hasAttribute('data-title-cover')).toBe(true)
    expect(header?.querySelector('.title-cover')?.textContent).toBe(cover)
    expect(document.querySelector('[data-topic="linuxdo:42"] .title-cover')?.textContent).toBe(cover)
    await click('标题伪装：开')
    expect(document.querySelector('.chat-header .conversation-title')?.hasAttribute('data-title-cover')).toBe(false)
    expect(document.querySelector('.chat-header .conversation-title .title-cover')).toBeNull()
  })

  it('resizes the topic list from its edge and restores the default on a double-click', async () => {
    const previous = window.innerWidth
    window.innerWidth = 1280
    try {
      const f = fixture()
      await mount(f.host)
      const edge = document.querySelector<HTMLElement>('.sidebar-resizer')
      const aside = document.querySelector<HTMLElement>('.sidebar')
      if (!edge || !aside) throw new Error('Missing list edge')
      aside.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 800, width: 320, height: 800, x: 0, y: 0, toJSON: () => ({}) })
      expect(edge.getAttribute('aria-valuenow')).toBe('320')
      expect(aside.style.width).toBe('320px')
      const point = (type: string, clientX: number) => edge.dispatchEvent(new PointerEvent(type, { button: 0, clientX, pointerId: 1, bubbles: true, cancelable: true }))
      await act(() => { point('pointerdown', 320) })
      await act(() => { point('pointermove', 360) })
      expect(aside.style.width).toBe('360px')
      await act(() => { point('pointerup', 360) }); await settle()
      expect(f.saved().listWidth).toBe(360)
      expect(edge.getAttribute('aria-valuenow')).toBe('360')
      expect(aside.style.width).toBe('360px')
      await act(() => { edge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) }); await settle()
      expect(f.saved().listWidth).toBe(320)
    } finally {
      window.innerWidth = previous
    }
  })

  it('discards a previous account’s delayed notifications after logout and a new login', async () => {
    const f = fixture(); const pending = f.holdNotifications(); await mount(f.host); await openNotifications()
    await click('退出登录'); f.account('bob'); await click('检查登录状态'); await openNotifications()
    expect(panel()?.textContent).toContain('For bob')
    await act(async () => pending.resolve(f.notificationPage('alice'))); await settle()
    expect(panel()?.textContent).toContain('For bob')
    expect(panel()?.textContent).not.toContain('For alice')
  })
})
