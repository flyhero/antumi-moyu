import { z } from 'zod'
import { CommunityInfo, ListParams, Thread, ThreadParams, Topic } from './community.js'
import type { Community } from './community.js'

// What the page may call, for the forums a plugin reads: each plugin (plugins/*) names its own. Every answer is parsed against the contract here, so a forum's surprise
// becomes an Error the page can show instead of a shape it cannot draw.

export type CallContext = { signal: AbortSignal }

const MAX_TOPICS = 100

function checkedParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  const where = issue && issue.path.length > 0 ? `（${issue.path.join('.')}）` : ''
  throw new Error(`请求的参数不对${where}`)
}

export function makeReader(all: Community[]) {
  const pick = (id: string): Community => {
    const found = all.find((community) => community.info.id === id)
    if (!found) throw new Error(`没有这个社区：${id}`)
    return found
  }

  return {
    async communities(_params: unknown, _context: CallContext): Promise<unknown> {
      return z.array(CommunityInfo).parse(all.map((community) => community.info))
    },

    async list(params: unknown, context: CallContext): Promise<unknown> {
      const { community, channel } = checkedParams(ListParams, params)
      const forum = pick(community)
      if (!forum.info.channels.some((known) => known.id === channel)) throw new Error(`${forum.info.name} 没有这个板块：${channel}`)
      const topics = await forum.list(channel, context.signal)
      const parsed = z.array(Topic).safeParse(topics.slice(0, MAX_TOPICS))
      if (!parsed.success) throw new Error(`${forum.info.name} 返回的内容读不懂`)
      return parsed.data
    },

    async thread(params: unknown, context: CallContext): Promise<unknown> {
      const { community, id, page } = checkedParams(ThreadParams, params)
      const forum = pick(community)
      const parsed = Thread.safeParse(await forum.thread(id, page, context.signal))
      if (!parsed.success) throw new Error(`${forum.info.name} 返回的内容读不懂`)
      return parsed.data
    }
  }
}
