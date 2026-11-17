import { describe, expect, it } from 'vitest'
import { CommunityInfo, Topic } from './community.js'
import type { Community } from './community.js'
import { linuxdo } from './communities/linuxdo.js'
import { v2ex } from './communities/v2ex.js'
import { makeReader } from './reader.js'

const context = { signal: new AbortController().signal }
const topic = (id: number): Topic => ({ community: 'v2ex', id: String(id), title: `t${id}`, author: 'a', avatar: null, channel: null, replies: 0, time: null, url: 'https://www.v2ex.com/t/1' })

function fake(overrides: Partial<Community> = {}): Community {
  return {
    info: { id: 'v2ex', name: 'V2EX', channels: [{ id: 'hot', name: '最热' }] },
    list: async () => [topic(1)],
    thread: async (id, page) => ({ topic: topic(Number(id)), opening: null, posts: [], page, more: false }),
    ...overrides
  }
}

describe('reader', () => {
  it('lists the forums it was given, one alone or both, with their channels', async () => {
    const ids = async (reader: ReturnType<typeof makeReader>) => {
      const parsed = CommunityInfo.array().parse(await reader.communities(undefined, context))
      expect(parsed.every((community) => community.channels.length > 0)).toBe(true)
      return parsed.map((community) => community.id)
    }
    expect(await ids(makeReader([linuxdo()]))).toEqual(['linuxdo'])
    expect(await ids(makeReader([v2ex()]))).toEqual(['v2ex'])
    expect(await ids(makeReader([linuxdo(), v2ex()]))).toEqual(['linuxdo', 'v2ex'])
  })

  it('does not know a forum it was not given', async () => {
    await expect(makeReader([v2ex()]).list({ community: 'linuxdo', channel: 'latest' }, context)).rejects.toThrow('没有这个社区')
  })

  it('passes a list through and caps it at 100 topics', async () => {
    const many = makeReader([fake({ list: async () => Array.from({ length: 150 }, (_, index) => topic(index + 1)) })])
    const topics = Topic.array().parse(await many.list({ community: 'v2ex', channel: 'hot' }, context))
    expect(topics).toHaveLength(100)
    expect(topics[0]?.id).toBe('1')
  })

  it('hands the call its channel, id, page and signal', async () => {
    const seen: unknown[] = []
    const spy = makeReader([fake({
      list: async (channel, signal) => (seen.push(['list', channel, signal === context.signal]), []),
      thread: async (id, page, signal) => (seen.push(['thread', id, page, signal === context.signal]), { topic: topic(1), opening: null, posts: [], page, more: false })
    })])
    await spy.list({ community: 'v2ex', channel: 'hot' }, context)
    await spy.thread({ community: 'v2ex', id: '42' }, context)
    await spy.thread({ community: 'v2ex', id: '42', page: 3 }, context)
    expect(seen).toEqual([['list', 'hot', true], ['thread', '42', 1, true], ['thread', '42', 3, true]])
  })

  it('refuses bad params with a readable Error', async () => {
    const forum = makeReader([fake()])
    for (const params of [undefined, null, 'x', {}, { community: 'reddit', channel: 'hot' }, { community: 'v2ex' }, { community: 'v2ex', channel: '' }]) {
      await expect(forum.list(params, context)).rejects.toThrow('请求的参数不对')
    }
    for (const params of [{ community: 'v2ex', id: 'abc' }, { community: 'v2ex', id: '1', page: 0 }, { community: 'v2ex', id: '1', page: 1.5 }, { community: 'v2ex', id: '../x' }, { community: 'v2ex' }]) {
      await expect(forum.thread(params, context)).rejects.toThrow('请求的参数不对')
    }
  })

  it('refuses an unknown channel or a missing community', async () => {
    const forum = makeReader([fake()])
    await expect(forum.list({ community: 'v2ex', channel: 'nope' }, context)).rejects.toThrow('V2EX 没有这个板块：nope')
    await expect(forum.list({ community: 'linuxdo', channel: 'latest' }, context)).rejects.toThrow('没有这个社区')
  })

  it('catches a forum that breaks the contract', async () => {
    const broken = makeReader([fake({
      // JSON.parse is untyped, like what a forum would send.
      list: async () => JSON.parse('[{"community":"v2ex","id":"1","time":"yesterday"}]'),
      thread: async () => JSON.parse('{"nope":true}')
    })])
    await expect(broken.list({ community: 'v2ex', channel: 'hot' }, context)).rejects.toThrow('V2EX 返回的内容读不懂')
    await expect(broken.thread({ community: 'v2ex', id: '1' }, context)).rejects.toThrow('V2EX 返回的内容读不懂')
  })

  it('lets a forum refusal through as it is', async () => {
    const refusing = makeReader([fake({ list: async () => { throw new Error('V2EX 暂时拒绝了请求，过一会儿再试') } })])
    await expect(refusing.list({ community: 'v2ex', channel: 'hot' }, context)).rejects.toThrow('V2EX 暂时拒绝了请求，过一会儿再试')
  })
})
