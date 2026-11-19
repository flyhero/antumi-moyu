import { z } from 'zod'
import { v2exReplyTarget } from './v2ex-reply-target.js'
import type { Community, CommunityInfo, Post, Topic } from '../community.js'
import { absoluteLinks, absoluteUrl } from '../absolute-urls.js'
import { get as httpGet } from '../http.js'
import type { Get, HttpResponse } from '../http.js'
import { parseJson } from '../json-body.js'

const ORIGIN = 'https://www.v2ex.com'
const UNREADABLE = 'V2EX 返回的内容读不懂'

const nodes = [
  { id: 'programmer', name: '程序员' },
  { id: 'share', name: '分享发现' },
  { id: 'create', name: '分享创造' },
  { id: 'qna', name: '问与答' },
  { id: 'jobs', name: '酷工作' },
  { id: 'career', name: '职场话题' },
  { id: 'python', name: 'Python' }
]

const info: CommunityInfo = {
  id: 'v2ex',
  name: 'V2EX',
  channels: [{ id: 'hot', name: '最热' }, { id: 'latest', name: '最新' }, ...nodes]
}

const RawMember = z.object({
  username: z.string(),
  avatar_large: z.string().nullish(),
  avatar_normal: z.string().nullish()
})

const RawTopic = z.object({
  id: z.number().int(),
  title: z.string(),
  url: z.string().nullish(),
  replies: z.number().int().nonnegative().nullish(),
  created: z.number().nullish(),
  last_touched: z.number().nullish(),
  member: RawMember.nullish(),
  node: z.object({ title: z.string() }).nullish(),
  content_rendered: z.string().nullish()
})
type RawTopic = z.infer<typeof RawTopic>

const RawReply = z.object({
  member: RawMember.nullish(),
  content_rendered: z.string().nullish(),
  created: z.number().nullish()
})
type RawReply = z.infer<typeof RawReply>

// V2EX counts in seconds.
function millis(seconds: number | null | undefined): number | null {
  return typeof seconds === 'number' ? seconds * 1000 : null
}

function avatarOf(member: z.infer<typeof RawMember> | null | undefined): string | null {
  return absoluteUrl(member?.avatar_large ?? member?.avatar_normal, ORIGIN)
}

// 403 and 429 both mean the hourly allowance (600 per IP) is spent; the reset header says when it is back.
function refusal(response: HttpResponse): Error {
  const reset = Number(response.headers['x-rate-limit-reset'])
  if (!Number.isFinite(reset) || reset <= 0) return new Error('V2EX 暂时拒绝了请求，过一会儿再试')
  const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000))
  return new Error(`V2EX 的请求额度用完了，${minutes} 分钟后恢复`)
}

function checked(response: HttpResponse, missing?: string): unknown {
  if (response.status === 403 || response.status === 429) throw refusal(response)
  if (response.status === 404 && missing) throw new Error(missing)
  if (response.status !== 200) throw new Error(`V2EX 返回了 ${response.status}`)
  return parseJson(response.body, 'V2EX')
}

function topicOf(raw: RawTopic): Topic {
  return {
    community: 'v2ex',
    id: String(raw.id),
    title: raw.title,
    author: raw.member?.username ?? '',
    avatar: avatarOf(raw.member),
    channel: raw.node?.title ?? null,
    replies: raw.replies ?? null,
    time: millis(raw.last_touched ?? raw.created),
    url: raw.url || `${ORIGIN}/t/${raw.id}`
  }
}

function toReplies(raws: RawReply[]): Post[] {
  const authors = new Map(raws.map((raw, index) => [index + 1, raw.member?.username ?? '']))
  return raws.map((raw, index) => {
    const floor = index + 1
    const html = raw.content_rendered ?? ''
    return {
      floor,
      author: authors.get(floor) ?? '',
      avatar: avatarOf(raw.member),
      html: absoluteLinks(html, ORIGIN),
      time: millis(raw.created),
      replyTo: v2exReplyTarget(html, floor, authors),
      likes: null
    }
  })
}

export function v2ex(get: Get = httpGet): Community {
  return {
    info,

    async list(channel, signal) {
      const path =
        channel === 'hot' ? '/api/topics/hot.json' :
        channel === 'latest' ? '/api/topics/latest.json' :
        nodes.some((node) => node.id === channel) ? `/api/topics/show.json?node_name=${channel}` :
        null
      if (!path) throw new Error(`V2EX 没有这个板块：${channel}`)
      const data = checked(await get(ORIGIN + path, signal))
      if (!Array.isArray(data)) throw new Error(UNREADABLE)
      // One odd item should not blank the whole list.
      return data.flatMap((item: unknown) => {
        const parsed = RawTopic.safeParse(item)
        return parsed.success ? [topicOf(parsed.data)] : []
      })
    },

    async thread(id, page, signal) {
      const shown = checked(await get(`${ORIGIN}/api/topics/show.json?id=${id}`, signal), '帖子不存在')
      if (!Array.isArray(shown)) throw new Error(UNREADABLE)
      if (shown.length === 0) throw new Error('帖子不存在')
      const parsed = RawTopic.safeParse(shown[0])
      if (!parsed.success) throw new Error(UNREADABLE)
      const raw = parsed.data
      const topic = topicOf(raw)

      // The replies endpoint ignores paging and returns them all, so only page 1 carries anything.
      if (page > 1) return { topic, opening: null, posts: [], page, more: false }

      const opening: Post = {
        floor: 0,
        author: topic.author,
        avatar: topic.avatar,
        html: absoluteLinks(raw.content_rendered ?? '', ORIGIN),
        time: millis(raw.created),
        replyTo: null,
        likes: null
      }
      const answers = checked(await get(`${ORIGIN}/api/replies/show.json?topic_id=${id}`, signal))
      if (!Array.isArray(answers)) throw new Error(UNREADABLE)
      const replies = answers.flatMap((item: unknown) => {
        const reply = RawReply.safeParse(item)
        // A reply we cannot read still holds its floor, so the numbers after it stay right.
        return [reply.success ? reply.data : {}]
      })
      return { topic, opening, posts: toReplies(replies), page, more: false }
    }
  }
}
