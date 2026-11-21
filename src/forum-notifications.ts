import { load } from 'cheerio/slim'
import { z } from 'zod'
import type { PluginPageContext } from '@antumi/plugin-sdk'
import { NotificationPage, NotificationParams, NotificationReadParams, type CommunityId, type ForumNotification, type Topic } from './community.js'
import { checkedSite, discourseCsrf, forumAccount, siteRequest, v2exAccount } from './forum-session.js'
import { parseJson } from './json-body.js'

const PAGE_SIZE = 20
const integer = z.number().int().nonnegative()
const RawNotification = z.object({
  id: integer, user_id: integer.optional(), notification_type: integer, read: z.boolean(), created_at: z.string().nullish(),
  post_number: integer.nullish(), topic_id: integer.nullish(), fancy_title: z.string().nullish(), data: z.unknown().optional()
})
const RawPage = z.object({
  notifications: z.array(RawNotification), total_rows_notifications: integer.optional(), seen_notification_id: integer.optional()
})
const Data = z.object({
  display_username: z.string().optional(), original_username: z.string().optional(), username: z.string().optional(),
  topic_title: z.string().optional(), badge_name: z.string().optional(), badge_id: integer.optional()
})

function plain(html: string, limit = 500): string {
  const $ = load(html)
  $('script, style, iframe').remove()
  return $.root().text().replace(/\s+/g, ' ').trim().slice(0, limit)
}

function kind(type: number): ForumNotification['kind'] {
  if ([1, 15].includes(type)) return 'mention'
  if ([2, 9, 802].includes(type)) return 'reply'
  if ([5, 19, 25].includes(type)) return 'like'
  if ([6, 7, 16].includes(type)) return 'message'
  return type === 3 ? 'quote' : 'other'
}

function topic(community: CommunityId, id: string, title: string): Topic {
  return { community, id, title, author: '', avatar: null, channel: null, replies: null, time: null,
    url: community === 'linuxdo' ? `https://linux.do/t/topic/${id}` : `https://www.v2ex.com/t/${id}` }
}

function dataOf(value: unknown): z.infer<typeof Data> {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return {} } }
  const result = Data.safeParse(value)
  return result.success ? result.data : {}
}

async function requireAccount(community: CommunityId, username: string, context: PluginPageContext) {
  const account = await forumAccount(community, context)
  if (!account) throw new Error('请先登录后查看通知')
  if (account.username !== username) throw new Error('登录账号已变化，请先检查登录状态')
  return account
}

export async function forumNotifications(community: CommunityId, params: unknown, context: PluginPageContext): Promise<NotificationPage> {
  const { account: username, page } = NotificationParams.parse(params)
  const account = await requireAccount(community, username, context)
  if (community === 'v2ex') {
    const html = checkedSite(await siteRequest(context, `/notifications?p=${page}`))
    return parseV2exNotifications(html, username, page)
  }
  const body = checkedSite(await siteRequest(context, `/notifications.json?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`))
  const parsed = RawPage.safeParse(parseJson(body, 'linux.do'))
  if (!parsed.success) throw new Error('linux.do 返回的通知读不懂')
  if (account.userId !== undefined && parsed.data.notifications.some((item) => item.user_id !== undefined && item.user_id !== account.userId)) throw new Error('登录账号已变化，请先检查登录状态')
  const items: ForumNotification[] = parsed.data.notifications.map((raw) => {
    const data = dataOf(raw.data)
    const title = plain(data.topic_title ?? raw.fancy_title ?? data.badge_name ?? '')
    const actor = data.display_username ?? data.username ?? data.original_username ?? null
    const one = raw.topic_id && /^\d{1,12}$/.test(String(raw.topic_id)) ? topic('linuxdo', String(raw.topic_id), title) : null
    const floor = raw.post_number && raw.post_number <= 1_000_000 ? raw.post_number : undefined
    const url = one ? one.url + (floor ? `/${floor}` : '') : data.badge_id ? `https://linux.do/badges/${data.badge_id}` : 'https://linux.do/my/notifications'
    const time = raw.created_at ? Date.parse(raw.created_at) : NaN
    return { id: String(raw.id), kind: kind(raw.notification_type), actor: actor ? plain(actor, 100) : null, title,
      excerpt: null, time: Number.isFinite(time) ? time : null, timeLabel: null, read: raw.read, url,
      target: one ? { topic: one, ...(floor ? { floor } : {}) } : null }
  })
  return NotificationPage.parse({ account: username, items, page,
    more: parsed.data.total_rows_notifications !== undefined ? page * PAGE_SIZE < parsed.data.total_rows_notifications : items.length === PAGE_SIZE,
    unread: account.unreadNotifications ?? null, seenId: parsed.data.seen_notification_id ?? null, readOnOpen: false })
}

export function parseV2exNotifications(html: string, username: string, page: number): NotificationPage {
  const account = v2exAccount(html)
  if (!account || account.username !== username) throw new Error('登录已过期或账号变化，请先检查登录状态')
  const $ = load(html)
  if (!$('#notifications').length) throw new Error('V2EX 返回的通知读不懂，请在浏览器查看')
  const items: ForumNotification[] = []
  $('#notifications .cell[id^="n_"]').each((_i, element) => {
    const row = $(element)
    const id = row.attr('id')?.slice(2) ?? ''
    if (!/^\d{1,16}$/.test(id)) return
    const link = row.find('a[href]').filter((_i, a) => {
      try {
        if ($(a).closest('.payload').length) return false
        const url = new URL($(a).attr('href') ?? '', 'https://www.v2ex.com'); return ['https://www.v2ex.com', 'https://v2ex.com'].includes(url.origin) && /^\/t\/\d+(?:\/)?$/.test(url.pathname) && !url.username && !url.password }
      catch { return false }
    }).first()
    const href = link.attr('href')
    const url = href ? new URL(href, 'https://www.v2ex.com') : null
    if (url?.origin === 'https://v2ex.com') url.hostname = 'www.v2ex.com'
    const idOfTopic = url ? /^\/t\/(\d{1,12})\/?$/.exec(url.pathname)?.[1] : undefined
    const title = plain(link.html() ?? '')
    const one = idOfTopic ? topic('v2ex', idOfTopic, title) : null
    const member = row.find('a[href^="/member/"]').filter((_i, a) => !$(a).closest('.payload').length && $(a).text().trim() !== '').first()
    const actor = plain(member.text(), 100) || null
    const description = plain(row.clone().find('.payload, .snow, .ago, .node, script, style, a').remove().end().html() ?? '')
    const activity: ForumNotification['kind'] = /感谢|喜欢|赞|thank|like/i.test(description) ? 'like' : /提到|mention|@/.test(description) ? 'mention' : /回复|reply|replied/i.test(description) ? 'reply' : 'other'
    const rawFloor = Number(url ? /^#reply(\d+)$/.exec(url.hash)?.[1] : undefined)
    const floor = Number.isInteger(rawFloor) && rawFloor > 0 && rawFloor <= 1_000_000 ? rawFloor : undefined
    const rawPage = Number(url?.searchParams.get('p'))
    const targetPage = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1000 ? rawPage : undefined
    const postId = url ? /^#r_(\d{1,16})$/.exec(url.hash)?.[1] : undefined
    const timeElement = row.find('.ago, .snow').first()
    const time = Date.parse(timeElement.attr('title') ?? '')
    items.push({ id, kind: activity, actor, title, excerpt: plain(row.find('.payload').html() ?? '', 400) || null,
      time: Number.isFinite(time) ? time : null, timeLabel: plain(timeElement.text(), 60) || null, read: null,
      url: url?.href ?? 'https://www.v2ex.com/notifications',
      target: one && (!postId || targetPage) ? { topic: one, ...(floor ? { floor } : {}), ...(targetPage ? { page: targetPage } : {}), ...(postId ? { postId } : {}) } : null })
  })
  const more = $('a.page_normal, a.page_current').toArray().some((a) => {
    try {
      const url = new URL($(a).attr('href') ?? '', 'https://www.v2ex.com')
      return Number($(a).text().trim()) > page || Number(url.searchParams.get('p')) > page
    } catch { return false }
  })
  return NotificationPage.parse({ account: username, items, page, more, unread: 0, seenId: null, readOnOpen: true })
}

export async function readForumNotification(community: CommunityId, params: unknown, context: PluginPageContext): Promise<{ read: boolean }> {
  const { account, id } = NotificationReadParams.parse(params)
  if (community !== 'linuxdo') throw new Error('V2EX 查看通知列表时会自动清除未读计数')
  await requireAccount(community, account, context)
  const csrf = await discourseCsrf(context)
  if (!csrf) throw new Error('未能取得验证信息，请重新登录')
  // Rails accepts its standard form override; the host bridge sends GET and POST.
  const body = new URLSearchParams({ _method: 'put', id }).toString()
  const response = await siteRequest(context, '/notifications/mark-read', { method: 'POST', body,
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': csrf, 'x-requested-with': 'XMLHttpRequest' } })
  const result = z.object({ success: z.literal('OK') }).safeParse(parseJson(checkedSite(response), 'linux.do'))
  if (!result.success) throw new Error('未能确认已读状态，请刷新通知后再试')
  return { read: true }
}
