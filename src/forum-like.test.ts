import { describe, expect, it, vi } from 'vitest'
import type { PluginBrowserRequest, PluginBrowserResponse, PluginPageContext } from '@antumi/plugin-sdk'
import { likeOutcome } from './forum-like.js'
import { v2exSession } from './communities/v2ex-session.js'
import { linuxdo } from './communities/linuxdo.js'

const account = '<div id="Top"><div class="tools"><a href="/member/alice">alice</a><a onclick="signout()">退出</a></div></div>'
const response = (body: string, status = 200, headers: Record<string, string> = {}): PluginBrowserResponse => ({ status, body, headers })
function harness(responses: PluginBrowserResponse[]) {
  const requests: PluginBrowserRequest[] = []
  const context: PluginPageContext = {
    signal: new AbortController().signal,
    browser: vi.fn(async (request) => {
      requests.push(request)
      const next = responses.shift()
      if (!next) throw new Error('unexpected request')
      return { connected: true, response: next }
    })
  }
  return { context, requests }
}
const posts = (requests: PluginBrowserRequest[]) => requests.filter((request) => request.action === 'request' && request.method === 'POST')

describe('liking on linux.do', () => {
  it('likes with a fresh CSRF token and reads the count back', async () => {
    const h = harness([response('{"csrf":"fresh"}'), response('{"id":9,"post_number":3,"reaction_users_count":4,"current_user_used_main_reaction":true}')])
    expect(await likeOutcome('linuxdo', { topic: '42', post: '9', liked: true }, h.context)).toEqual({ state: 'done', liked: true, likes: 4 })
    expect(posts(h.requests)).toEqual([expect.objectContaining({ path: '/post_actions', headers: expect.objectContaining({ 'x-csrf-token': 'fresh' }), body: 'id=9&post_action_type_id=2&flag_topic=false' })])
  })

  it('undoes a like as a POST that says DELETE, since the bridge sends only GET and POST', async () => {
    const h = harness([response('{"csrf":"fresh"}'), response('{"id":9,"post_number":3,"reaction_users_count":3,"current_user_used_main_reaction":false}')])
    expect(await likeOutcome('linuxdo', { topic: '42', post: '9', liked: false }, h.context)).toEqual({ state: 'done', liked: false, likes: 3 })
    expect(posts(h.requests)).toEqual([expect.objectContaining({ path: '/post_actions/9', body: '_method=DELETE&post_action_type_id=2' })])
  })

  it('shows what Discourse says when it refuses, and its wait on a rate limit', async () => {
    const refused = harness([response('{"csrf":"c"}'), response('{"errors":["你不能再撤销这个操作了"],"error_type":"invalid_access"}', 403)])
    expect(await likeOutcome('linuxdo', { topic: '42', post: '9', liked: false }, refused.context)).toEqual({ state: 'failed', failure: { kind: 'rejected', message: '你不能再撤销这个操作了' } })
    const limited = harness([response('{"csrf":"c"}'), response('{"errors":["点赞太快了"],"extras":{"wait_seconds":12.5}}', 429)])
    expect(await likeOutcome('linuxdo', { topic: '42', post: '9', liked: true }, limited.context)).toEqual({ state: 'failed', failure: { kind: 'rate-limit', message: '点赞太快了', retryAfter: 13 } })
  })

  it('asks to sign in again when the session is gone', async () => {
    const h = harness([response('{"csrf":"c"}'), response('', 403)])
    expect(await likeOutcome('linuxdo', { topic: '42', post: '9', liked: true }, h.context)).toMatchObject({ state: 'failed', failure: { kind: 'login' } })
  })

  it('reads whether the signed-in reader liked a post, and nothing for an anonymous one', async () => {
    const body = JSON.stringify({ id: 7, title: 'T', post_stream: { stream: [1, 2, 3], posts: [
      { id: 1, post_number: 1, username: 'a', cooked: '', actions_summary: [] },
      { id: 2, post_number: 2, username: 'b', cooked: '', current_user_used_main_reaction: true, reaction_users_count: 2 },
      { id: 3, post_number: 3, username: 'c', cooked: '', actions_summary: [{ id: 2, count: 1, can_act: true }] }
    ] } })
    const thread = await linuxdo(async () => ({ status: 200, headers: {}, body })).thread('7', 1, new AbortController().signal)
    expect(thread.opening).toMatchObject({ id: '1' })
    expect(thread.opening).not.toHaveProperty('liked')
    expect(thread.posts.map((post) => [post.id, post.liked, post.likes])).toEqual([['2', true, 2], ['3', false, 1]])
  })
})

describe('thanking on V2EX', () => {
  const page = `${account}<script>var once = "31337";</script><div id="Main"></div>`

  it('thanks a reply with a fresh once', async () => {
    const h = harness([response(page), response('{"success":true,"once":"31338"}')])
    expect(await likeOutcome('v2ex', { topic: '42', post: '987', liked: true }, h.context)).toEqual({ state: 'done', liked: true, likes: null })
    expect(h.requests[0]).toMatchObject({ path: '/t/42' })
    expect(posts(h.requests)).toEqual([expect.objectContaining({ path: '/thank/reply/987?once=31337' })])
  })

  it('never takes thanks back, and sends nothing trying', async () => {
    const h = harness([])
    expect(await likeOutcome('v2ex', { topic: '42', post: '987', liked: false }, h.context)).toMatchObject({ state: 'failed', failure: { kind: 'rejected' } })
    expect(h.requests).toHaveLength(0)
  })

  it('shows V2EX\'s own refusal, and asks to sign in when the page is anonymous', async () => {
    const refused = harness([response(page), response('{"success":false,"message":"铜币不足"}')])
    expect(await likeOutcome('v2ex', { topic: '42', post: '987', liked: true }, refused.context)).toEqual({ state: 'failed', failure: { kind: 'rejected', message: '铜币不足' } })
    const anonymous = harness([response('<div id="Main"></div>')])
    expect(await likeOutcome('v2ex', { topic: '42', post: '987', liked: true }, anonymous.context)).toMatchObject({ state: 'failed', failure: { kind: 'login' } })
    expect(posts(anonymous.requests)).toHaveLength(0)
  })

  it('reads thanks and their count from a signed-in thread', async () => {
    const row = (id: number, thanks: string, hearts: string) => `<div class="cell" id="r_${id}"><div class="fr">${thanks}<span class="no">${id}</span></div><a class="dark" href="/member/u${id}">u${id}</a> <span class="ago" title="2026-01-01 00:00:00 +08:00">1 小时前</span>${hearts}<div class="reply_content">r${id}</div></div>`
    const html = `${account}<div id="Main"><div class="header"><h1>Topic</h1><a href="/member/author">author</a></div>`
      + row(1, '<div id="thank_area_1" class="thank_area"><a class="thank">感谢回复者</a></div>', '')
      + row(2, '<div id="thank_area_2" class="thank_area thanked">感谢已发送</div>', '<span class="small fade"><img src="/static/img/heart_neue_red.png" alt="❤️"> 3</span>')
      + row(3, '', '<span class="small fade"><img src="/static/img/heart_neue_red.png" alt="❤️"> 1</span>')
      + '</div>'
    const thread = await v2exSession(async () => response(html)).thread('42', 1, new AbortController().signal)
    expect(thread.posts.map((post) => [post.id, post.liked, post.likes])).toEqual([['1', false, 0], ['2', true, 3], ['3', undefined, 1]])
  })
})
