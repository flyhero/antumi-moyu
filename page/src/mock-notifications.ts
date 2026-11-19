import type { CommunityId, ForumNotification, NotificationPage } from '../../src/community'
import { mockThread } from './mock-data'

export function mockNotifications(community: CommunityId, page: number, now: number, read: Set<string>, unread: number): NotificationPage {
  const one = mockThread(community, community === 'linuxdo' ? '3200001' : '1257800', 1, now).topic
  const kinds: ForumNotification['kind'][] = ['reply', 'mention', 'like', 'quote', 'message', 'other']
  const names = ['long_night', 'nimbus', 'pixel', 'dusk', 'momo', 'snowpea']
  const items = kinds.slice(page === 1 ? 0 : 3, page === 1 ? 3 : 6).map((kind, index): ForumNotification => {
    const id = String(101 + index + (page - 1) * 3)
    const floor = community === 'linuxdo' ? 23 + index : 8 + index
    return { id, kind, actor: names[index + (page - 1) * 3] ?? 'pixel', title: one.title,
      excerpt: index === 0 ? '感谢分享，关于你刚才提到的做法，我也整理了一些经验。' : null,
      time: now - (index + 1 + page) * 60_000, timeLabel: null, read: community === 'v2ex' ? null : read.has(id),
      url: one.url, target: { topic: one, floor } }
  })
  return { account: 'preview-reader', items, page, more: page === 1, unread: community === 'v2ex' ? 0 : unread, seenId: 100, readOnOpen: community === 'v2ex' }
}
