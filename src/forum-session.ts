import { load } from 'cheerio/slim'
import { z } from 'zod'
import type { PluginBrowserResponse, PluginPageContext } from '@antumi/plugin-sdk'
import { ReplyParams, type CommunityId, type ForumAccount, type ReplyFailure, type ReplyResult } from './community.js'
import { parseJson } from './json-body.js'

class ReplyError extends Error {
  constructor(readonly failure: ReplyFailure) { super(failure.message) }
}
const unconfirmed = () => new ReplyError({ kind: 'unconfirmed', message: '发送结果未能确认，草稿已保留。请先查看帖子，确认后再决定是否重发' })

export function siteFailure(error: unknown): ReplyFailure | null {
  return error instanceof ReplyError ? error.failure : null
}

// Structured failures survive the page bridge, whose thrown errors carry only text.
export async function replyOutcome(community: CommunityId, params: unknown, context: PluginPageContext): Promise<ReplyResult> {
  let posted = false
  try {
    return await sendForumReply(community, params, {
      ...context,
      browser(request) {
        if (request.action === 'request' && request.method === 'POST') posted = true
        return context.browser(request)
      }
    })
  } catch (error) {
    if (error instanceof ReplyError) return { state: 'failed', failure: error.failure }
    if (posted) return { state: 'failed', failure: unconfirmed().failure }
    return { state: 'failed', failure: { kind: 'rejected', message: error instanceof Error ? error.message : String(error) } }
  }
}

export async function siteRequest(context: PluginPageContext, path: string, options: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}): Promise<PluginBrowserResponse> {
  context.signal.throwIfAborted()
  const result = await context.browser({ action: 'request', site: 'forum', path, ...options })
  if (!result.response) throw new Error('浏览器没有返回站点内容，请重新登录')
  return result.response
}

export function checkedSite(response: PluginBrowserResponse): string {
  if (response.status === 429) {
    const value = response.headers['retry-after']
    const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? Math.ceil((Date.parse(value) - Date.now()) / 1000) : NaN
    const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : undefined
    throw new ReplyError({
      kind: 'rate-limit',
      message: retryAfter !== undefined ? `请求过于频繁，请 ${retryAfter} 秒后再试` : '请求过于频繁，请稍后再试',
      ...(retryAfter ? { retryAfter } : {})
    })
  }
  if (response.status === 401 || response.status === 403 || /Just a moment|cf-chl-/.test(response.body)) throw new ReplyError({ kind: 'login', message: '登录已过期或站点要求验证，请在浏览器完成登录后检查状态' })
  if (response.status >= 300 && response.status < 400) throw new ReplyError({ kind: 'login', message: '站点要求重新登录，请打开登录页面' })
  if (response.status !== 200) throw new Error(`站点返回了 ${response.status}`)
  return response.body
}

// Discourse answers a GET that is neither XHR nor asking for JSON with its HTML app shell.
const DISCOURSE_XHR = { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' }
export async function discourseCsrf(context: PluginPageContext): Promise<string | null> {
  const csrf = z.object({ csrf: z.string().min(1) }).safeParse(parseJson(checkedSite(await siteRequest(context, '/session/csrf', { headers: DISCOURSE_XHR })), 'linux.do'))
  return csrf.success ? csrf.data.csrf : null
}

export function v2exAccount(html: string): ForumAccount | null {
  const $ = load(html)
  const link = $('#Top .tools a[href^="/member/"]').first().attr('href')
  if (!link || !$('#Top .tools a[onclick*="signout"], #Top .tools a[href*="signout"]').length) return null
  const username = /^\/member\/([^/?#]+)$/.exec(link)?.[1]
  if (!username) return null
  const count = /^\s*(\d+)\s*(?:条|unread)/i.exec($('#Rightbar a[href$="notifications"]').first().text())?.[1]
  return { username: decodeURIComponent(username), ...(count ? { unreadNotifications: Number(count) } : {}) }
}

export async function forumAccount(community: CommunityId, context: PluginPageContext): Promise<ForumAccount | null> {
  if (!(await context.browser({ action: 'status', site: 'forum' })).connected) return null
  const response = await siteRequest(context, community === 'linuxdo' ? '/session/current.json' : '/')
  if (response.status === 404 || response.status === 401 || response.status === 302 || response.status === 303) return null
  const body = checkedSite(response)
  if (community === 'v2ex') return v2exAccount(body)
  const data = z.object({ current_user: z.object({ username: z.string().min(1), id: z.number().int().positive().optional().catch(undefined), all_unread_notifications_count: z.number().int().nonnegative().optional().catch(undefined) }).nullish() }).safeParse(parseJson(body, 'linux.do'))
  if (!data.success || !data.data.current_user) return null
  const { username, id, all_unread_notifications_count: count } = data.data.current_user
  return { username, ...(count !== undefined ? { unreadNotifications: count } : {}), ...(id !== undefined ? { userId: id } : {}) }
}

export async function sendForumReply(community: CommunityId, params: unknown, context: PluginPageContext): Promise<ReplyResult> {
  const { id, content, target } = ReplyParams.parse(params)
  const postedContent = community === 'v2ex' && target ? `@${target.author} #${target.floor}\n\n${content}` : content
  let path: string
  let body: URLSearchParams
  let headers: Record<string, string>
  let beforeIds = new Set<string>()
  if (community === 'linuxdo') {
    const account = await forumAccount(community, context)
    if (!account) throw new ReplyError({ kind: 'login', message: '请先登录再回复' })
    const csrf = await discourseCsrf(context)
    if (!csrf) throw new ReplyError({ kind: 'login', message: '未能取得发送所需的验证信息，请重新登录' })
    path = '/posts.json'
    body = new URLSearchParams({ topic_id: id, raw: content })
    if (target) body.set('reply_to_post_number', String(target.floor))
    headers = { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': csrf, ...DISCOURSE_XHR }
  } else {
    const response = await siteRequest(context, `/t/${id}`)
    const html = checkedSite(response)
    if (!v2exAccount(html)) throw new ReplyError({ kind: 'login', message: '请先登录再回复' })
    const $ = load(html)
    const once = $('input[name="once"]').first().attr('value')
      ?? /[?&]once=(\d+)/.exec($('.topic_buttons a[href*="once="]').first().attr('href') ?? '')?.[1]
    if (!once || !$('#reply_content').length) throw new Error('这个帖子当前不能回复，请在浏览器查看')
    beforeIds = new Set($('.cell[id^="r_"]').map((_index, item) => $(item).attr('id') ?? '').get())
    path = `/t/${id}`
    body = new URLSearchParams({ content: postedContent, once })
    headers = { 'content-type': 'application/x-www-form-urlencoded' }
  }
  let response: PluginBrowserResponse
  try {
    response = await siteRequest(context, path, { method: 'POST', body: body.toString(), headers })
  } catch {
    throw unconfirmed()
  }
  if (community === 'linuxdo') {
    if (response.status === 429 || response.status === 401 || response.status === 403) checkedSite(response)
    const result = z.object({ id: z.number().optional(), post_number: z.number().int().positive().optional(), post: z.object({ id: z.number(), post_number: z.number().int().positive().optional() }).optional(), action: z.string().optional(), errors: z.array(z.string()).optional() }).safeParse(parseJson(response.body, 'linux.do'))
    if (result.success) {
      if (result.data.errors?.length) throw new ReplyError({ kind: 'rejected', message: result.data.errors.join('；') })
      if (response.status < 200 || response.status >= 300) throw new Error(`站点返回了 ${response.status}`)
      if (result.data.action === 'enqueued') return { state: 'pending', message: '回复已提交，等待社区审核' }
      if (result.data.id || result.data.post?.id) {
        const floor = result.data.post_number ?? result.data.post?.post_number
        return { state: 'sent', message: null, ...(floor ? { location: { floor } } : {}) }
      }
    }
  } else {
    if (response.status === 302 || response.status === 303) {
      const url = new URL(response.headers.location ?? '/', 'https://www.v2ex.com')
      if (url.origin === 'https://www.v2ex.com' && url.pathname === `/t/${id}`) {
        const floor = Number(/^#reply(\d+)$/.exec(url.hash)?.[1])
        const page = Number(url.searchParams.get('p'))
        const location = { ...(floor > 0 && floor <= 1_000_000 ? { floor } : {}), ...(page >= 1 && page <= 1000 && Number.isInteger(page) ? { page } : {}) }
        return { state: 'sent', message: null, ...(Object.keys(location).length ? { location } : {}) }
      }
      throw new ReplyError({ kind: url.origin === 'https://www.v2ex.com' && url.pathname === '/signin' ? 'login' : 'unconfirmed', message: '登录可能已过期，请重新登录后检查帖子；草稿已保留' })
    }
    const html = checkedSite(response)
    const $ = load(html)
    const problem = $('#Main .problem').text().trim()
    if (problem) throw new ReplyError({ kind: /频繁|太快|稍后|too (?:many|fast)/i.test(problem) ? 'rate-limit' : 'rejected', message: problem.slice(0, 500) })
    // V2EX renders newlines as <br>; compare the displayed text of a newly added reply.
    const normalized = (text: string) => text.replace(/\s+/gu, ' ').trim()
    const posted = $('.cell[id^="r_"]').toArray().find((item) => {
      if (beforeIds.has($(item).attr('id') ?? '')) return false
      const rendered = $(item).find('.reply_content').clone()
      rendered.find('br').replaceWith('\n')
      return normalized(rendered.text()) === normalized(postedContent)
    })
    if (posted) {
      const floor = Number($(posted).find('.no').first().text().trim())
      return { state: 'sent', message: null, ...(Number.isInteger(floor) && floor > 0 ? { location: { floor } } : {}) }
    }
  }
  throw unconfirmed()
}
