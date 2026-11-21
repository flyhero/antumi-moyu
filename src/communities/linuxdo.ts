import { z } from 'zod'
import type { Community, CommunityInfo, Post, Topic } from '../community.js'
import { absoluteLinks, absoluteUrl } from '../absolute-urls.js'
import { get as httpGet } from '../http.js'
import type { Get, HttpResponse } from '../http.js'
import { parseJson } from '../json-body.js'
import { parseRss } from '../rss.js'

const ORIGIN = 'https://linux.do'
const PAGE_SIZE = 20
const UNREADABLE = 'linux.do 返回的内容读不懂'

const paths: Record<string, string> = {
  latest: '/latest.rss',
  top: '/top.rss?period=daily',
  develop: '/c/develop/4.rss',
  gossip: '/c/gossip/11.rss',
  resource: '/c/resource/14.rss',
  welfare: '/c/welfare/36.rss',
  news: '/c/news/34.rss'
}

const info: CommunityInfo = {
  id: 'linuxdo',
  name: 'linux.do',
  channels: [
    { id: 'latest', name: '最新' },
    { id: 'top', name: '热门' },
    { id: 'develop', name: '开发调优' },
    { id: 'gossip', name: '搞七捻三' },
    { id: 'resource', name: '资源荟萃' },
    { id: 'welfare', name: '福利羊毛' },
    { id: 'news', name: '前沿快讯' }
  ]
}

function retryAfterSeconds(headers: Record<string, string>): number | undefined {
  const value = headers['retry-after']
  const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? Math.ceil((Date.parse(value) - Date.now()) / 1000) : NaN
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : undefined
}

// Cloudflare's challenge arrives as a 403 or a 200 page with this header or title. A plain 429 is
// the forum's own rate limit, including when the built-in browser session is already logged in.
function checked(response: HttpResponse, missing?: string): string {
  const challenged = 'cf-mitigated' in response.headers || response.body.includes('Just a moment')
  if (challenged) throw new Error('linux.do 暂时拦住了请求，过一会儿再试')
  if (response.status === 429) {
    const retry = retryAfterSeconds(response.headers)
    throw new Error(retry !== undefined ? `请求过于频繁，请 ${retry} 秒后再试` : '请求过于频繁，请稍后再试')
  }
  if (response.status === 403) throw new Error('linux.do 暂时拦住了请求，过一会儿再试')
  if (response.status === 404 && missing) throw new Error(missing)
  if (response.status !== 200) throw new Error(`linux.do 返回了 ${response.status}`)
  return response.body
}

function millis(value: string | null | undefined): number | null {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? null : time
}

const RawPost = z.object({
  id: z.number(),
  post_number: z.number().int(),
  username: z.string().nullish(),
  name: z.string().nullish(),
  avatar_template: z.string().nullish(),
  created_at: z.string().nullish(),
  cooked: z.string().nullish(),
  post_type: z.number().nullish(),
  reply_to_post_number: z.number().int().nonnegative().nullish(),
  reaction_users_count: z.number().int().nonnegative().nullish(),
  actions_summary: z.array(z.object({ id: z.number(), count: z.number().optional() })).nullish(),
  hidden: z.boolean().nullish(),
  deleted_at: z.string().nullish(),
  user_deleted: z.boolean().nullish(),
  user_id: z.number().int().nullish()
})
type RawPost = z.infer<typeof RawPost>

const RawThread = z.object({
  id: z.number().int(),
  title: z.string(),
  posts_count: z.number().int().nonnegative().nullish(),
  created_at: z.string().nullish(),
  last_posted_at: z.string().nullish(),
  // Discourse's own topic-owner check uses this id, also published as details.created_by.id.
  user_id: z.number().int().nullish(),
  details: z.object({ created_by: z.object({ id: z.number().int(), username: z.string().nullish() }).nullish() }).nullish(),
  post_stream: z.object({ posts: z.array(RawPost), stream: z.array(z.number()).nullish() })
})

// Discourse's id 2 is the like; reaction_users_count counts every reaction and is what its page shows.
function likesOf(raw: RawPost): number {
  if (typeof raw.reaction_users_count === 'number') return raw.reaction_users_count
  return raw.actions_summary?.find((action) => action.id === 2)?.count ?? 0
}

// linux.do serves its avatars and emoji with Cross-Origin-Resource-Policy: same-origin, so a page
// that is not linux.do cannot show them. Its CDN serves the same paths to anyone.
const SAME_ORIGIN_ASSETS = /https:\/\/linux\.do\/(?=(?:user_avatar|letter_avatar|images\/emoji)\/)/g
function fromCdn(text: string): string {
  return text.replace(SAME_ORIGIN_ASSETS, 'https://cdn.ldstatic.com/')
}

function avatarOf(raw: RawPost): string | null {
  const avatar = absoluteUrl(raw.avatar_template?.replace('{size}', '96'), ORIGIN)
  return avatar ? fromCdn(avatar) : null
}

// A normal, visible post; small actions ("closed", "pinned") and removed ones are not for reading.
function readable(raw: RawPost): boolean {
  return (raw.post_type ?? 1) === 1 && !raw.hidden && !raw.deleted_at && !raw.user_deleted
}

function toPost(raw: RawPost, authorId: number | null): Post {
  return {
    floor: raw.post_number,
    author: raw.username || raw.name || '',
    avatar: avatarOf(raw),
    html: fromCdn(absoluteLinks(raw.cooked ?? '', ORIGIN)),
    time: millis(raw.created_at),
    replyTo: raw.reply_to_post_number ?? null,
    likes: likesOf(raw),
    // A missing id is not a match: the same display name can belong to someone else.
    byAuthor: authorId !== null && raw.user_id === authorId
  }
}

export function linuxdo(get: Get = httpGet): Community {
  return {
    info,

    async list(channel, signal) {
      const path = paths[channel]
      if (!path) throw new Error(`linux.do 没有这个板块：${channel}`)
      const body = checked(await get(ORIGIN + path, signal))
      if (!body.includes('<rss')) throw new Error(UNREADABLE)

      const topics: Topic[] = []
      for (const item of parseRss(body)) {
        const id = /\/t\/(?:[^/]+\/)?(\d+)(?:[/?#]|$)/.exec(item.link ?? '')?.[1]
        if (!id || !item.link) continue
        // The description ends with "N 个帖子 - M 位参与者"; the first of those is the opening post.
        const count = /(\d+) 个帖子/.exec(item.description ?? '')?.[1]
        topics.push({
          community: 'linuxdo',
          id,
          title: item.title ?? '',
          author: item.creator ?? '',
          avatar: null,
          channel: item.category,
          replies: count ? Math.max(Number(count) - 1, 0) : null,
          time: millis(item.pubDate),
          url: item.link
        })
      }
      return topics
    },

    async thread(id, page, signal, focus) {
      if (focus?.floor || focus?.tail) {
        const path = focus.floor ? `/t/${id}/${focus.floor}.json` : `/t/topic/${id}.json`
        const near = RawThread.safeParse(parseJson(checked(await get(ORIGIN + path, signal)), 'linux.do'))
        if (!near.success) throw new Error(UNREADABLE)
        const stream = near.data.post_stream.stream ?? []
        if (focus.tail) page = Math.max(1, Math.ceil(stream.length / PAGE_SIZE))
        else {
          const closest = near.data.post_stream.posts.toSorted((a, b) => Math.abs(a.post_number - (focus.floor ?? 1)) - Math.abs(b.post_number - (focus.floor ?? 1)))[0]
          const index = closest ? stream.indexOf(closest.id) : -1
          page = index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : 1
        }
      }
      const query = page > 1 ? `?page=${page}` : ''
      const body = checked(await get(`${ORIGIN}/t/topic/${id}.json${query}`, signal), '帖子不存在，或者需要登录才能看')
      const parsed = RawThread.safeParse(parseJson(body, 'linux.do'))
      if (!parsed.success) throw new Error(UNREADABLE)
      const raw = parsed.data

      const visible = raw.post_stream.posts.filter(readable)
      const first = page === 1 ? visible.find((post) => post.post_number === 1) : undefined
      // Page 1 can fall back to the opening post's id; later pages only have the topic's id.
      const authorId = raw.user_id ?? raw.details?.created_by?.id ?? first?.user_id ?? null
      const opening = first ? { ...toPost(first, authorId), byAuthor: true } : null
      const posts = visible.filter((post) => post !== first).map((post) => toPost(post, authorId))

      // Post numbers skip removed posts, so position comes from the stream of ids: more is whether
      // the last post this page loaded is short of the stream's end.
      const stream = raw.post_stream.stream ?? []
      const lastLoaded = raw.post_stream.posts.at(-1)
      const position = lastLoaded ? stream.indexOf(lastLoaded.id) + 1 : 0
      const more = position > 0 && position < stream.length

      const author = opening?.author || raw.details?.created_by?.username || ''
      const topic: Topic = {
        community: 'linuxdo',
        id: String(raw.id),
        title: raw.title,
        author,
        avatar: opening?.avatar ?? null,
        channel: null,
        replies: typeof raw.posts_count === 'number' ? Math.max(raw.posts_count - 1, 0) : null,
        time: millis(raw.last_posted_at) ?? millis(raw.created_at),
        url: `${ORIGIN}/t/topic/${raw.id}`
      }
      return { topic, opening, posts, page, more }
    }
  }
}
