import { z } from 'zod'
import type { PluginPageContext } from '@antumi/plugin-sdk'
import { linuxdo } from './communities/linuxdo.js'
import { v2ex } from './communities/v2ex.js'
import { v2exSession } from './communities/v2ex-session.js'
import type { CommunityId } from './community.js'
import { ListParams, ThreadParams } from './community.js'
import { likeOutcome } from './forum-like.js'
import { forumAccount, replyOutcome, siteRequest } from './forum-session.js'
import { forumNotifications, readForumNotification } from './forum-notifications.js'
import { watchForumNotifications } from './notification-watch.js'
import { makeReader } from './reader.js'
import type { Get } from './http.js'

function acceptFor(path: string): string {
  if (path.includes('.json')) return 'application/json'
  if (path.includes('.rss')) return 'application/rss+xml, application/atom+xml;q=0.9, */*;q=0.8'
  return '*/*'
}

export function makeBrowserReader(community: CommunityId) {
  const anonymous = makeReader([community === 'linuxdo' ? linuxdo() : v2ex()])
  const authenticated = (context: PluginPageContext) => {
    const get: Get = (url) => {
      const origin = community === 'linuxdo' ? 'https://linux.do' : 'https://www.v2ex.com'
      const parsed = new URL(url)
      if (parsed.origin !== origin) throw new Error('不能读取其他站点')
      const path = parsed.pathname + parsed.search
      return siteRequest(context, path, { headers: { accept: acceptFor(path) } })
    }
    return makeReader([community === 'linuxdo' ? linuxdo(get) : v2exSession(get)])
  }
  return {
    ...anonymous,
    login: (_params: unknown, context: PluginPageContext) => context.browser({ action: 'open', site: 'forum' }).then(() => ({ opened: true })),
    logout: (_params: unknown, context: PluginPageContext) => context.browser({ action: 'disconnect', site: 'forum' }).then(() => ({ disconnected: true })),
    session: (_params: unknown, context: PluginPageContext) => forumAccount(community, context),
    notifications: (params: unknown, context: PluginPageContext) => forumNotifications(community, params, context),
    notificationRead: (params: unknown, context: PluginPageContext) => readForumNotification(community, params, context),
    notificationWatch: (params: unknown, context: PluginPageContext) => watchForumNotifications(community, params, context),
    reply: (params: unknown, context: PluginPageContext) => replyOutcome(community, params, context),
    like: (params: unknown, context: PluginPageContext) => likeOutcome(community, params, context),
    list: (params: unknown, context: PluginPageContext) => {
      const input = ListParams.extend({ authenticated: z.boolean().default(false) }).parse(params)
      return (input.authenticated ? authenticated(context) : anonymous).list(input, context)
    },
    thread: (params: unknown, context: PluginPageContext) => {
      const input = ThreadParams.extend({ authenticated: z.boolean().default(false) }).parse(params)
      return (input.authenticated ? authenticated(context) : anonymous).thread(input, context)
    }
  }
}
