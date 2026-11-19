import { load } from 'cheerio/slim'
import { z } from 'zod'
import type { PluginPageContext } from '@antumi/plugin-sdk'
import { NotificationWatchParams, type CommunityId, type NotificationUpdate } from './community.js'
import { checkedSite, forumAccount, siteFailure, siteRequest } from './forum-session.js'

const count = z.number().int().nonnegative()
const User = z.object({ id: count.positive(), username: z.string().min(1), all_unread_notifications_count: count.optional(), notification_channel_position: count.optional() })
const Settings = z.object({ long_polling_base_url: z.string().optional(), polling_interval: count.optional() })
const Message = z.object({ channel: z.string(), message_id: count.optional(), data: z.unknown() })
const Counts = z.object({ all_unread_notifications_count: count.optional() })
const decode = (value: unknown): unknown => typeof value === 'string' ? JSON.parse(value) : value

// The shared key stays in this invocation, never in the page or saved state.
export function notificationBootstrap(html: string) {
  const $ = load(html)
  const element = $('#data-preloaded, [data-preloaded]').first()
  const preloaded = z.object({ currentUser: z.unknown(), siteSettings: z.unknown() }).parse(JSON.parse(element.attr('data-preloaded') ?? element.text()))
  const user = User.parse(decode(preloaded.currentUser))
  const settings = Settings.parse(decode(preloaded.siteSettings))
  const base = new URL(settings.long_polling_base_url || '/', 'https://linux.do')
  if (!['https://linux.do', 'https://ping.linux.do'].includes(base.origin) || base.username || base.password || base.search || base.hash) throw new Error('linux.do 通知地址未获允许')
  const sharedKey = $('meta[name="shared_session_key"]').attr('content')
  if (base.origin !== 'https://linux.do' && !sharedKey) throw new Error('通知验证信息缺失，请重新检查登录状态')
  return { user, base, sharedKey, interval: Math.max(1000, Math.min(settings.polling_interval ?? 3000, 180_000)) }
}

export async function watchForumNotifications(community: CommunityId, params: unknown, context: PluginPageContext): Promise<NotificationUpdate> {
  const input = NotificationWatchParams.parse(params)
  try {
    if (community === 'v2ex') {
      const account = await forumAccount(community, context)
      if (!account || account.username !== input.account) return { state: 'login', message: '登录已过期或账号变化，请检查登录状态' }
      return { state: 'ok', account, changed: false, interval: 180_000 }
    }
    if (!(await context.browser({ action: 'status', site: 'forum' })).connected) return { state: 'login', message: '请先登录后接收通知' }
    const home = await siteRequest(context, '/')
    if ([301, 302, 303, 401].includes(home.status)) return { state: 'login', message: '请重新登录后接收通知' }
    const bootstrap = notificationBootstrap(checkedSite(home))
    const { user, base, sharedKey, interval } = bootstrap
    if (user.username !== input.account || (input.userId !== undefined && input.userId !== user.id)) return { state: 'login', message: '登录账号已变化，请检查登录状态' }
    const account = { username: user.username, userId: user.id, ...(user.all_unread_notifications_count !== undefined ? { unreadNotifications: user.all_unread_notifications_count } : {}) }
    if (input.cursor === undefined) return { state: 'ok', account, cursor: user.notification_channel_position ?? -1, changed: false, interval: 100 }
    const channel = `/notification/${user.id}`
    const body = new URLSearchParams({ [channel]: String(input.cursor), __seq: '1' }).toString()
    const path = `${base.pathname.replace(/\/$/, '')}/message-bus/${input.clientId}/poll`
    const result = await context.browser({ action: 'request', site: 'forum', origin: base.origin, path, method: 'POST', timeoutMs: 35_000, body,
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'dont-chunk': 'true', 'discourse-present': 'true', ...(base.origin !== 'https://linux.do' && sharedKey ? { 'x-shared-session-key': sharedKey } : {}) } })
    if (!result.response) throw new Error('通知连接没有返回内容')
    const messages = z.array(Message).max(1000).parse(JSON.parse(checkedSite(result.response)))
    let cursor = input.cursor
    let changed = false
    for (const message of messages) {
      if (message.channel === '/__status') {
        const status = z.record(z.string(), z.number().int()).parse(message.data)
        if (status[channel] !== undefined && status[channel] > cursor) { cursor = status[channel]; changed = true }
      } else if (message.channel === channel && message.message_id !== undefined && message.message_id > cursor) {
        const data = Counts.parse(message.data)
        cursor = message.message_id
        if (data.all_unread_notifications_count !== undefined) account.unreadNotifications = data.all_unread_notifications_count
        changed = true
      }
    }
    return { state: 'ok', account, cursor, changed, interval: changed ? 100 : interval }
  } catch (error) {
    context.signal.throwIfAborted()
    const failure = siteFailure(error)
    return { state: failure?.kind === 'login' ? 'login' : 'retry', message: failure?.message ?? (error instanceof Error ? error.message : String(error)), ...(failure?.retryAfter ? { retryAfter: failure.retryAfter } : {}) }
  }
}
