import { describe, expect, it } from 'vitest'
import type { PluginBrowserRequest, PluginBrowserResponse, PluginPageContext } from '@antumi/plugin-sdk'
import { forumNotifications, readForumNotification } from './forum-notifications.js'
import { forumAccount } from './forum-session.js'
import { notificationBootstrap, watchForumNotifications } from './notification-watch.js'

const account = '<div id="Top"><div class="tools"><a href="/member/alice">alice</a><a onclick="signout()">退出</a></div></div>'
const home = `${account}<div id="Rightbar"><a href="/notifications">3 条未读提醒</a></div>`
const current = '{"current_user":{"username":"alice","all_unread_notifications_count":3}}'
const bootstrap = (overrides: Record<string, unknown> = {}) => {
  const currentUser = { id: 7, username: 'alice', all_unread_notifications_count: 3, notification_channel_position: 90, ...overrides }
  const preloaded = JSON.stringify({ currentUser: JSON.stringify(currentUser), siteSettings: JSON.stringify({ long_polling_base_url: 'https://ping.linux.do', polling_interval: 3000 }) })
  return `<meta name="shared_session_key" content="shared"><script type="application/json" id="data-preloaded">${preloaded}</script>`
}
const stream = { origin: 'https://ping.linux.do', path: '/', sharedKey: 'shared', interval: 3000 }
const response = (body: string, status = 200): PluginBrowserResponse => ({ body, status, headers: {} })
const discourse = (extra: object = {}) => JSON.stringify({ notifications: [{ id: 101, notification_type: 2, read: false, created_at: '2026-11-18T10:00:00Z', topic_id: 42, post_number: 47,
  data: { display_username: 'bob', topic_title: '<b>A &amp; B</b><script>bad()</script>' } }], total_rows_notifications: 21, seen_notification_id: 90, ...extra })
const v2 = (href = '/t/42#reply101') => `${account}<div id="notifications"><div class="cell" id="n_101"><table><tr><td><a href="/member/bob"><img alt="bob"></a></td><td><a href="/member/bob">bob</a> 在 <a href="${href}">A &amp; B</a> 里回复了你 <span class="snow">2 小时前</span><div class="payload"><b>hello</b><script>bad()</script></div></td></tr></table></div></div><a class="page_normal" href="/notifications?p=2">2</a>`
function fixture(responses: (PluginBrowserResponse | Error)[], connected = true) {
  const requests: PluginBrowserRequest[] = []
  const context: PluginPageContext = { signal: new AbortController().signal, async browser(request) {
    requests.push(request)
    if (request.action === 'status') return { connected }
    if (request.action !== 'request') throw new Error('Unexpected browser operation')
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (!next) throw new Error('Unexpected request')
    return { connected, response: next }
  } }
  return { context, requests }
}

describe('forum notifications', () => {
  it('reads the official MessageBus bootstrap without exposing its shared key', () => {
    expect(notificationBootstrap(bootstrap())).toMatchObject({ user: { id: 7, username: 'alice', notification_channel_position: 90 },
      base: new URL('https://ping.linux.do'), sharedKey: 'shared', interval: 3000 })
    expect(() => notificationBootstrap(bootstrap().replace('https://ping.linux.do', 'https://other.test'))).toThrow('未获允许')
    expect(() => notificationBootstrap(bootstrap().replace('<meta name="shared_session_key" content="shared">', ''))).toThrow('验证信息缺失')
  })

  it('starts a linux.do notification cursor before opening a long poll', async () => {
    const f = fixture([response(bootstrap())])
    expect(await watchForumNotifications('linuxdo', { account: 'alice', clientId: 'a'.repeat(32) }, f.context)).toEqual({
      state: 'ok', account: { username: 'alice', userId: 7, unreadNotifications: 3 }, cursor: 90, changed: false, interval: 100, bootstrap: stream
    })
    expect(f.requests.filter((request) => request.action === 'request')).toHaveLength(1)
  })

  it('long-polls the declared MessageBus origin and returns its latest unread count', async () => {
    const payload = JSON.stringify([{ channel: '/notification/7', message_id: 91, data: { all_unread_notifications_count: 4 } }])
    const f = fixture([response(bootstrap()), response(payload)])
    expect(await watchForumNotifications('linuxdo', { account: 'alice', clientId: 'b'.repeat(32), cursor: 90, userId: 7 }, f.context)).toEqual({
      state: 'ok', account: { username: 'alice', userId: 7, unreadNotifications: 4 }, cursor: 91, changed: true, interval: 100, bootstrap: stream
    })
    expect(f.requests.at(-1)).toMatchObject({ action: 'request', origin: 'https://ping.linux.do', path: '/message-bus/' + 'b'.repeat(32) + '/poll', method: 'POST', timeoutMs: 35000,
      headers: { 'x-shared-session-key': 'shared', 'discourse-present': 'true', 'dont-chunk': 'true' } })
  })

  it('polls with the page-held stream address and does not read the home page again', async () => {
    const f = fixture([response('[]')])
    expect(await watchForumNotifications('linuxdo', { account: 'alice', clientId: 'e'.repeat(32), cursor: 90, userId: 7, bootstrap: stream }, f.context)).toEqual({
      state: 'ok', account: { username: 'alice', userId: 7 }, cursor: 90, changed: false, interval: 3000
    })
    const requests = f.requests.filter((request) => request.action === 'request')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ origin: 'https://ping.linux.do', path: '/message-bus/' + 'e'.repeat(32) + '/poll', method: 'POST',
      headers: { 'x-shared-session-key': 'shared' } })
  })

  it('reads the home page again when the held address has no cursor or user to go with it', async () => {
    const f = fixture([response(bootstrap())])
    expect(await watchForumNotifications('linuxdo', { account: 'alice', clientId: 'e'.repeat(32), bootstrap: stream }, f.context)).toMatchObject({ cursor: 90, bootstrap: stream })
    expect(f.requests.filter((request) => request.action === 'request')).toHaveLength(1)
    expect(f.requests.at(-1)).toMatchObject({ path: '/' })
  })

  it('asks the page to sign in again when a held address is refused', async () => {
    const f = fixture([response('', 403)])
    expect(await watchForumNotifications('linuxdo', { account: 'alice', clientId: 'e'.repeat(32), cursor: 90, userId: 7, bootstrap: stream }, f.context)).toMatchObject({ state: 'login' })
  })

  it('refuses a held address that points anywhere but linux.do', async () => {
    const f = fixture([])
    for (const bad of [{ ...stream, origin: 'https://other.test' }, { ...stream, path: '/../x' }, { ...stream, path: 'x' }]) {
      await expect(watchForumNotifications('linuxdo', { account: 'alice', clientId: 'e'.repeat(32), cursor: 90, userId: 7, bootstrap: bad }, f.context)).rejects.toThrow()
    }
    expect(f.requests).toHaveLength(0)
  })

  it('uses a MessageBus status frame to recover a cursor even when it has no message id', async () => {
    const payload = JSON.stringify([{ channel: '/__status', data: { '/notification/7': 95 } }])
    const f = fixture([response(bootstrap()), response(payload)])
    expect(await watchForumNotifications('linuxdo', { account: 'alice', clientId: 'd'.repeat(32), cursor: 90, userId: 7 }, f.context)).toMatchObject({
      state: 'ok', cursor: 95, changed: true, interval: 100
    })
  })

  it('checks only V2EX account state and asks the page to wait 3 minutes', async () => {
    const f = fixture([response(home)])
    expect(await watchForumNotifications('v2ex', { account: 'alice', clientId: 'c'.repeat(32) }, f.context)).toEqual({
      state: 'ok', account: { username: 'alice', unreadNotifications: 3 }, changed: false, interval: 180000
    })
    expect(f.requests.at(-1)).toMatchObject({ action: 'request', path: '/' })
  })

  it('gets unread counts from the existing account check without opening notifications', async () => {
    const linux = fixture([response(current)])
    expect(await forumAccount('linuxdo', linux.context)).toEqual({ username: 'alice', unreadNotifications: 3 })
    const v = fixture([response(home)])
    expect(await forumAccount('v2ex', v.context)).toEqual({ username: 'alice', unreadNotifications: 3 })
    expect(v.requests.at(-1)).toMatchObject({ path: '/' })
  })

  it('does not invent zero when the site omits the unread counter', async () => {
    expect(await forumAccount('v2ex', fixture([response(account)]).context)).toEqual({ username: 'alice' })
    expect(await forumAccount('linuxdo', fixture([response('{"current_user":{"username":"alice"}}')]).context)).toEqual({ username: 'alice' })
  })

  it('reads a Discourse page without changing seen or read state', async () => {
    const f = fixture([response(current), response(discourse())])
    const result = await forumNotifications('linuxdo', { account: 'alice' }, f.context)
    expect(result).toMatchObject({ page: 1, more: true, unread: 3, seenId: 90, readOnOpen: false,
      items: [{ id: '101', kind: 'reply', actor: 'bob', title: 'A & B', read: false, target: { topic: { id: '42' }, floor: 47 } }] })
    expect(f.requests.at(-1)).toMatchObject({ path: '/notifications.json?limit=20&offset=0' })
    expect(f.requests.some((request) => request.action === 'request' && request.method === 'POST')).toBe(false)
  })

  it('uses a fixed offset for subsequent pages and respects the actual total', async () => {
    const f = fixture([response(current), response(discourse())])
    expect(await forumNotifications('linuxdo', { account: 'alice', page: 2 }, f.context)).toMatchObject({ more: false, page: 2 })
    expect(f.requests.at(-1)).toMatchObject({ path: '/notifications.json?limit=20&offset=20' })
  })

  it('handles data encoded as JSON, unknown types and non-topic notifications', async () => {
    const f = fixture([response(current), response(discourse({ notifications: [
      { id: 102, notification_type: 12, read: true, data: JSON.stringify({ badge_name: '<b>Regular</b>', badge_id: 7 }) },
      { id: 103, notification_type: 9000, read: false, data: 'unreadable' }
    ] }))])
    const result = await forumNotifications('linuxdo', { account: 'alice' }, f.context)
    expect(result.items[0]).toMatchObject({ title: 'Regular', url: 'https://linux.do/badges/7', target: null })
    expect(result.items[1]).toMatchObject({ kind: 'other', target: null, url: 'https://linux.do/my/notifications' })
  })

  it('extracts V2EX topic and floor links and reports its read-on-open rule', async () => {
    const f = fixture([response(home), response(v2())])
    const result = await forumNotifications('v2ex', { account: 'alice' }, f.context)
    expect(result).toMatchObject({ unread: 0, readOnOpen: true, more: true, items: [
      { id: '101', kind: 'reply', actor: 'bob', excerpt: 'hello', title: 'A & B', timeLabel: '2 小时前', read: null,
        target: { topic: { id: '42' }, floor: 101 } }
    ] })
    expect(f.requests.at(-1)).toMatchObject({ path: '/notifications?p=1' })
  })

  it('preserves an actual V2EX reply id with its explicit page instead of treating it as a floor', async () => {
    const f = fixture([response(home), response(v2('/t/42?p=3#r_987654'))])
    expect((await forumNotifications('v2ex', { account: 'alice', page: 2 }, f.context)).items[0]?.target).toMatchObject({ page: 3, postId: '987654' })
    const unknownPage = fixture([response(home), response(v2('/t/42#r_987654'))])
    expect((await forumNotifications('v2ex', { account: 'alice' }, unknownPage.context)).items[0]).toMatchObject({ target: null, url: 'https://www.v2ex.com/t/42#r_987654' })
  })

  it('normalizes V2EX’s official hostname alias and classifies the action independently of its title', async () => {
    const f = fixture([response(home), response(v2('https://v2ex.com/t/42#reply101').replace('A &amp; B', '提到 @bob 的问题'))])
    const item = (await forumNotifications('v2ex', { account: 'alice' }, f.context)).items[0]
    expect(item).toMatchObject({ kind: 'reply', url: 'https://www.v2ex.com/t/42#reply101', target: { floor: 101 } })
  })

  it('never follows a notification to another origin or renders raw HTML', async () => {
    const f = fixture([response(home), response(v2('https://evil.test/t/42#reply1'))])
    const item = (await forumNotifications('v2ex', { account: 'alice' }, f.context)).items[0]
    expect(item).toMatchObject({ target: null, url: 'https://www.v2ex.com/notifications', excerpt: 'hello' })
  })

  it('does not clear a badge when a login or challenge page replaces the notification page', async () => {
    const f = fixture([response(home), response('<div id="Main">Please sign in</div>')])
    await expect(forumNotifications('v2ex', { account: 'alice' }, f.context)).rejects.toThrow('登录已过期')
    const malformed = fixture([response(home), response(account)])
    await expect(forumNotifications('v2ex', { account: 'alice' }, malformed.context)).rejects.toThrow('读不懂')
  })

  it('refuses anonymous, mismatched-account and invalid requests before reading private notifications', async () => {
    const anonymous = fixture([], false)
    await expect(forumNotifications('v2ex', { account: 'alice' }, anonymous.context)).rejects.toThrow('请先登录')
    const other = fixture([response(current)])
    await expect(forumNotifications('linuxdo', { account: 'bob' }, other.context)).rejects.toThrow('账号已变化')
    expect(other.requests.filter((request) => request.action === 'request')).toHaveLength(1)
    const invalid = fixture([])
    await expect(forumNotifications('linuxdo', { account: 'alice', page: -1 }, invalid.context)).rejects.toThrow()
    expect(invalid.requests).toHaveLength(0)
  })

  it('rejects another account’s notification response if the browser session changes mid-request', async () => {
    const f = fixture([response('{"current_user":{"username":"alice","id":7}}'), response(discourse({ notifications: [{ id: 9, user_id: 8, notification_type: 2, read: false }] }))])
    await expect(forumNotifications('linuxdo', { account: 'alice' }, f.context)).rejects.toThrow('账号已变化')
  })

  it('marks exactly one notification read with fresh CSRF and the Rails form method', async () => {
    const f = fixture([response(current), response('{"csrf":"fresh"}'), response('{"success":"OK"}')])
    expect(await readForumNotification('linuxdo', { account: 'alice', id: '101' }, f.context)).toEqual({ read: true })
    expect(f.requests.at(-1)).toMatchObject({ path: '/notifications/mark-read', method: 'POST', body: '_method=put&id=101', headers: { 'x-csrf-token': 'fresh' } })
    expect(f.requests.filter((request) => request.action === 'request' && request.method === 'POST')).toHaveLength(1)
  })

  it('does not retry a failed read-state write, nor report success before it is confirmed', async () => {
    const f = fixture([response(current), response('{"csrf":"fresh"}'), new Error('Timeout')])
    await expect(readForumNotification('linuxdo', { account: 'alice', id: '101' }, f.context)).rejects.toThrow('Timeout')
    expect(f.requests.filter((request) => request.action === 'request' && request.method === 'POST')).toHaveLength(1)
    const bad = fixture([response(current), response('{"csrf":"fresh"}'), response('{"success":false}')])
    await expect(readForumNotification('linuxdo', { account: 'alice', id: '101' }, bad.context)).rejects.toThrow('未能确认')
  })
})
