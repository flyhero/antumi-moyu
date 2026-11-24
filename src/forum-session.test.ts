import { describe, expect, it, vi } from 'vitest'
import type { PluginBrowserRequest, PluginBrowserResponse, PluginPageContext } from '@antumi/plugin-sdk'
import { forumAccount, replyOutcome, sendForumReply } from './forum-session.js'
import { v2exSession } from './communities/v2ex-session.js'

const account = '<div id="Top"><div class="tools"><a href="/member/alice">alice</a><a onclick="signout()">退出</a></div></div>'
const topic = `${account}<div id="Main"><div class="header"><h1>Topic</h1><a href="/member/author">author</a></div><div class="topic_content">Opening</div><form><input name="once" value="fresh-once"><textarea id="reply_content"></textarea></form><div class="cell" id="r_1"><span class="no">1</span><a class="dark" href="/member/bob">bob</a><div class="reply_content">Old</div></div><a class="page_normal">2</a></div>`
const response = (body: string, status = 200, headers: Record<string, string> = {}): PluginBrowserResponse => ({ status, body, headers })
function harness(responses: (PluginBrowserResponse | Error)[], connected = true) {
  const requests: PluginBrowserRequest[] = []
  const context: PluginPageContext = {
    signal: new AbortController().signal,
    browser: vi.fn(async (request) => {
      requests.push(request)
      if (request.action === 'status') return { connected }
      if (request.action !== 'request') throw new Error('unexpected operation')
      const next = responses.shift()
      if (next instanceof Error) throw next
      if (!next) throw new Error('unexpected request')
      return { connected, response: next }
    })
  }
  return { context, requests }
}

describe('forum sign-in and reply', () => {
  it('does not ask a forum when the isolated browser has no session', async () => {
    const h = harness([], false)
    expect(await forumAccount('linuxdo', h.context)).toBeNull()
    expect(h.requests).toEqual([{ action: 'status', site: 'forum' }])
  })

  it('checks the forum account rather than treating any cookie as a login', async () => {
    expect(await forumAccount('linuxdo', harness([response('{"current_user":null}')]).context)).toBeNull()
    expect(await forumAccount('v2ex', harness([response('<a href="/member/other">other</a>')]).context)).toBeNull()
    expect(await forumAccount('v2ex', harness([response(account)]).context)).toEqual({ username: 'alice' })
  })

  it('obtains fresh CSRF before posting a Discourse reply with the browser session', async () => {
    const h = harness([response('{"current_user":{"username":"alice"}}'), response('{"csrf":"fresh-csrf"}'), response('{"id":123}')])
    expect(await sendForumReply('linuxdo', { id: '42', content: 'Hello world' }, h.context)).toEqual({ state: 'sent', message: null, location: { postId: '123' } })
    expect(h.requests).toContainEqual(expect.objectContaining({ action: 'request', path: '/session/csrf', headers: expect.objectContaining({ 'x-requested-with': 'XMLHttpRequest' }) }))
    expect(h.requests.at(-1)).toMatchObject({ path: '/posts.json', method: 'POST', headers: { 'x-csrf-token': 'fresh-csrf' }, body: 'topic_id=42&raw=Hello+world' })
  })

  it('attaches a Discourse reply to the selected floor without rewriting its text', async () => {
    const h = harness([response('{"current_user":{"username":"alice"}}'), response('{"csrf":"fresh-csrf"}'), response('{"id":124}')])
    await sendForumReply('linuxdo', { id: '42', content: 'Hello world', target: { floor: 7, author: 'bob' } }, h.context)
    expect(h.requests.at(-1)).toMatchObject({ path: '/posts.json', body: 'topic_id=42&raw=Hello+world&reply_to_post_number=7' })
    expect(h.requests.filter((request) => request.action === 'request' && request.method === 'POST')).toHaveLength(1)
  })

  it('tells the user when a Discourse reply is queued for moderation', async () => {
    const h = harness([response('{"current_user":{"username":"alice"}}'), response('{"csrf":"csrf"}'), response('{"action":"enqueued"}')])
    expect(await sendForumReply('linuxdo', { id: '42', content: 'Hello' }, h.context)).toMatchObject({ state: 'pending' })
  })

  it('does not submit if CSRF could not be obtained', async () => {
    const h = harness([response('{"current_user":{"username":"alice"}}'), response('blocked', 403)])
    await expect(sendForumReply('linuxdo', { id: '42', content: 'Hello' }, h.context)).rejects.toThrow('验证')
    expect(h.requests.some((request) => request.action === 'request' && request.method === 'POST')).toBe(false)
  })

  it('shows Discourse validation errors and accepts a created response', async () => {
    const responses = [response('{"current_user":{"username":"alice"}}'), response('{"csrf":"csrf"}')]
    const rejected = harness([...responses, response('{"errors":["回复至少需要 20 个字符"]}', 422)])
    await expect(sendForumReply('linuxdo', { id: '42', content: 'Short' }, rejected.context)).rejects.toThrow('20 个字符')
    const created = harness([...responses, response('{"id":123}', 201)])
    await expect(sendForumReply('linuxdo', { id: '42', content: 'Created' }, created.context)).resolves.toMatchObject({ state: 'sent' })
  })

  it('fetches a fresh V2EX once and posts the reply form', async () => {
    const h = harness([response(topic), response('', 302, { location: '/t/42#reply2' })])
    expect(await sendForumReply('v2ex', { id: '42', content: 'Reply' }, h.context)).toEqual({ state: 'sent', message: null, location: { floor: 2 } })
    expect(h.requests.at(-1)).toMatchObject({ path: '/t/42', method: 'POST', body: 'content=Reply&once=fresh-once' })
  })

  it('addresses a V2EX comment by username and floor with a fresh once', async () => {
    const h = harness([response(topic), response('', 302, { location: '/t/42#reply2' })])
    await sendForumReply('v2ex', { id: '42', content: 'Reply & details', target: { floor: 1, author: 'bob' } }, h.context)
    expect(h.requests.at(-1)).toMatchObject({ path: '/t/42', method: 'POST', body: new URLSearchParams({ content: '@bob #1\n\nReply & details', once: 'fresh-once' }).toString() })
  })

  it('confirms a new V2EX reply using the addressed text returned by the forum', async () => {
    const added = '<div class="cell" id="r_2"><div class="reply_content">@<a href="/member/bob">bob</a> #1<br>\n<br>\nReply</div></div>'
    const h = harness([response(topic), response(topic + added)])
    await expect(sendForumReply('v2ex', { id: '42', content: 'Reply', target: { floor: 1, author: 'bob' } }, h.context)).resolves.toMatchObject({ state: 'sent' })
  })

  it('keeps an addressed reply unconfirmed when the forum returns the same page', async () => {
    const h = harness([response(topic), response(topic)])
    await expect(sendForumReply('v2ex', { id: '42', content: 'Reply', target: { floor: 1, author: 'bob' } }, h.context)).rejects.toThrow('草稿已保留')
    expect(h.requests.filter((request) => request.action === 'request' && request.method === 'POST')).toHaveLength(1)
  })

  it('does not follow a reply response to a login page or another origin', async () => {
    for (const location of ['/signin', 'https://other.test/t/42']) {
      const h = harness([response(topic), response('', 302, { location })])
      await expect(sendForumReply('v2ex', { id: '42', content: 'Reply' }, h.context)).rejects.toThrow('草稿已保留')
      expect(h.requests).toHaveLength(2)
    }
  })

  it('does not mistake an unchanged page or a validation problem for a successful reply', async () => {
    const h = harness([response(topic), response(topic)])
    await expect(sendForumReply('v2ex', { id: '42', content: 'Reply' }, h.context)).rejects.toThrow('未能确认')
    const rejected = harness([response(topic), response(`${topic}<div id="Main"><div class="problem">回复过于频繁</div></div>`)])
    await expect(sendForumReply('v2ex', { id: '42', content: 'Reply' }, rejected.context)).rejects.toThrow('过于频繁')
  })

  it('never retries a timed-out write and reports the outcome as unconfirmed', async () => {
    const h = harness([response(topic), new Error('timeout')])
    await expect(sendForumReply('v2ex', { id: '42', content: 'Reply' }, h.context)).rejects.toThrow('先查看帖子')
    expect(h.requests.filter((request) => request.action === 'request' && request.method === 'POST')).toHaveLength(1)
  })

  it('rejects an invalid post id or empty content before any browser request', async () => {
    const h = harness([])
    await expect(sendForumReply('v2ex', { id: '../signin', content: 'Reply' }, h.context)).rejects.toThrow()
    await expect(sendForumReply('linuxdo', { id: '42', content: '  ' }, h.context)).rejects.toThrow()
    for (const target of [{ floor: 0, author: 'bob' }, { floor: 1.5, author: 'bob' }, { floor: 1, author: 'bob\n@alice' }, { floor: 1, author: '' }]) {
      await expect(sendForumReply('v2ex', { id: '42', content: 'Reply', target }, h.context)).rejects.toThrow()
    }
    expect(h.requests).toHaveLength(0)
  })

  it('marks a signed-in reply as the topic author by avatar id, and by the site badge when the id is missing', async () => {
    const html = `${account}<div id="Main"><div class="header"><h1>Topic</h1><img class="avatar" data-uid="7" alt="author"><a href="/member/author">author</a></div><div class="topic_content">Opening</div><div class="cell" id="r_1"><span class="no">1</span><img class="avatar" data-uid="7" alt="author"><a class="dark" href="/member/same">same</a><div class="reply_content">Mine</div></div><div class="cell" id="r_2"><span class="no">2</span><img class="avatar" data-uid="8" alt="other"><a class="dark" href="/member/same">same</a><div class="reply_content">Other</div></div><div class="cell" id="r_3"><span class="no">3</span><a class="dark" href="/member/author">author</a><div class="badges"><div class="badge op">OP</div></div><div class="reply_content">Badge</div></div></div>`
    const result = await v2exSession(async () => response(html)).thread('42', 1, new AbortController().signal)
    expect(result.posts.map((post) => post.byAuthor)).toEqual([true, false, true])
  })

  it('reads logged-in V2EX HTML and preserves reply floors and paging', async () => {
    const get = vi.fn(async () => response(topic))
    const result = await v2exSession(get).thread('42', 1, new AbortController().signal)
    expect(result).toMatchObject({ topic: { title: 'Topic', author: 'author' }, opening: { html: 'Opening' }, posts: [{ floor: 1, author: 'bob', html: 'Old' }], more: true })
    expect(get).toHaveBeenCalledWith('https://www.v2ex.com/t/42?p=1', expect.any(AbortSignal))
  })

  it('retains an explicit V2EX floor reference after a signed-in refresh', async () => {
    const added = '<div class="cell" id="r_2"><span class="no">2</span><a class="dark" href="/member/alice">alice</a><div class="reply_content">@<a href="/member/bob">bob</a> #1 Reply</div></div>'
    const result = await v2exSession(async () => response(topic + added)).thread('42', 1, new AbortController().signal)
    expect(result.posts[1]).toMatchObject({ floor: 2, replyTo: 1 })
  })

  it('opens an authenticated V2EX floor on its page directly', async () => {
    const urls: string[] = []
    const get = async (url: string) => { urls.push(url); return response(topic) }
    const result = await v2exSession(get).thread('42', 1, new AbortController().signal, { floor: 201 })
    expect(result.page).toBe(3)
    expect(urls).toEqual(['https://www.v2ex.com/t/42?p=3'])
  })

  it('reads the final V2EX page without requesting each preceding page', async () => {
    const urls: string[] = []
    const get = async (url: string) => { urls.push(url); return response(topic + '<a class="page_normal">4</a>') }
    const result = await v2exSession(get).thread('42', 1, new AbortController().signal, { tail: true })
    expect(result.page).toBe(4)
    expect(urls).toEqual(['https://www.v2ex.com/t/42?p=1', 'https://www.v2ex.com/t/42?p=4'])
  })

  it('does not silently show a sign-in page as an empty authenticated list', async () => {
    const get = async () => response('<div id="Main"><form action="/signin">Sign in</form></div>')
    await expect(v2exSession(get).list('latest', new AbortController().signal)).rejects.toThrow('登录已过期')
  })
})

describe('reply outcomes for the page', () => {
  it('classifies a 429 challenge before posting as verification, not a timed rate limit', async () => {
    const h = harness([response('<html><title>Just a moment...</title></html>', 429)])
    expect(await replyOutcome('linuxdo', { id: '42', content: 'Reply' }, h.context)).toMatchObject({ state: 'failed', failure: { kind: 'login', message: expect.stringContaining('Cloudflare 验证') } })
    expect(h.requests.some((request) => request.action === 'request' && request.method === 'POST')).toBe(false)
  })
  it('returns the native Discourse floor for locating the new reply', async () => {
    const h = harness([response('{"current_user":{"username":"alice"}}'), response('{"csrf":"csrf"}'), response('{"id":123,"post_number":47}', 201)])
    expect(await replyOutcome('linuxdo', { id: '42', content: 'Reply' }, h.context)).toMatchObject({ state: 'sent', location: { postId: '123', floor: 47 } })
  })

  it.each([false, true])('returns the cooked Discourse post from the send response without reading the thread (wrapped: %s)', async (wrapped) => {
    const post = { id: 123, post_number: 47, username: 'alice', avatar_template: '/user_avatar/linux.do/alice/{size}/1.png',
      cooked: '<p><strong>Reply</strong><img class="emoji" src="/images/emoji/smile.png"></p>', created_at: '2026-11-24T01:00:00.000Z', reply_to_post_number: 16 }
    const h = harness([response('{"current_user":{"username":"alice"}}'), response('{"csrf":"csrf"}'), response(JSON.stringify(wrapped ? { post } : post), 201)])
    expect(await replyOutcome('linuxdo', { id: '42', content: '**Reply**', target: { floor: 16, author: 'bob' } }, h.context)).toMatchObject({
      state: 'sent', location: { postId: '123', floor: 47 },
      post: { id: '123', floor: 47, author: 'alice', avatar: 'https://cdn.ldstatic.com/user_avatar/linux.do/alice/96/1.png',
        html: '<p><strong>Reply</strong><img class="emoji" src="https://cdn.ldstatic.com/images/emoji/smile.png"></p>', time: Date.parse(post.created_at), replyTo: 16 }
    })
    expect(h.requests.filter((request) => request.action === 'request')).toHaveLength(3)
    expect(h.requests.some((request) => request.action === 'request' && request.path.startsWith('/t/'))).toBe(false)
  })

  it('classifies expired login before sending', async () => {
    const h = harness([response('Sign in', 403)])
    expect(await replyOutcome('v2ex', { id: '42', content: 'Reply' }, h.context)).toMatchObject({ state: 'failed', failure: { kind: 'login' } })
    expect(h.requests).toHaveLength(1)
  })

  it('passes on rate limiting and its cooldown without repeating the POST', async () => {
    const h = harness([response(topic), response('Slow down', 429, { 'retry-after': '15' })])
    expect(await replyOutcome('v2ex', { id: '42', content: 'Reply' }, h.context)).toMatchObject({ state: 'failed', failure: { kind: 'rate-limit', retryAfter: 15 } })
    expect(h.requests).toHaveLength(2)
  })

  it('distinguishes a lost POST response from a rejected preflight', async () => {
    const uncertain = harness([response(topic), new Error('timeout')])
    expect(await replyOutcome('v2ex', { id: '42', content: 'Reply' }, uncertain.context)).toMatchObject({ state: 'failed', failure: { kind: 'unconfirmed' } })
    expect(uncertain.requests.filter((request) => request.action === 'request' && request.method === 'POST')).toHaveLength(1)
    const preflight = harness([new Error('network unavailable')])
    expect(await replyOutcome('v2ex', { id: '42', content: 'Reply' }, preflight.context)).toMatchObject({ state: 'failed', failure: { kind: 'rejected' } })
  })
})
