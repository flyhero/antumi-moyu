import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Get, HttpResponse } from '../http.js'
import { v2ex } from './v2ex.js'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
const signal = new AbortController().signal

function answer(body: string, status = 200, headers: Record<string, string> = {}): Get {
  return async () => ({ status, headers, body })
}

// Answers by path, and remembers what was asked.
function site(routes: Record<string, string | HttpResponse>): { get: Get; urls: string[] } {
  const urls: string[] = []
  const get: Get = async (url) => {
    urls.push(url)
    const route = Object.entries(routes).find(([path]) => url.includes(path))?.[1]
    if (route === undefined) return { status: 404, headers: {}, body: '' }
    return typeof route === 'string' ? { status: 200, headers: {}, body: route } : route
  }
  return { get, urls }
}

const reply = (name: string, html: string, created = 1_700_000_000) => ({
  member: { username: name, avatar_large: `//cdn.v2ex.com/${name}.png` }, content_rendered: html, created
})
const mention = (name: string, extra = '') => `@<a href="/member/${name}">${name}</a> ${extra}`
const topicBody = JSON.stringify([{ id: 5, title: 'T', url: 'https://www.v2ex.com/t/5', replies: 4, created: 1_700_000_000, member: { username: 'op' }, node: { title: 'N' }, content_rendered: '<p>hi</p>' }])

afterEach(() => vi.useRealTimers())

describe('v2ex list', () => {
  it('maps the hot list', async () => {
    const { get, urls } = site({ '/api/topics/hot.json': fixture('v2ex-hot.json') })
    const topics = await v2ex(get).list('hot', signal)
    expect(urls).toEqual(['https://www.v2ex.com/api/topics/hot.json'])
    expect(topics).toHaveLength(3)
    expect(topics[0]).toEqual({
      community: 'v2ex',
      id: '1257707',
      title: '今天是我的生日',
      author: 'Tarrency',
      avatar: 'https://cdn.v2ex.com/avatar/878a/98cb/601093_large.png?m=1732081345',
      channel: '生活',
      replies: 347,
      time: 1794921207000,
      url: 'https://www.v2ex.com/t/1257707'
    })
  })

  it('asks for the path of each channel', async () => {
    const expected: Record<string, string> = {
      hot: '/api/topics/hot.json',
      latest: '/api/topics/latest.json',
      programmer: '/api/topics/show.json?node_name=programmer',
      share: '/api/topics/show.json?node_name=share',
      create: '/api/topics/show.json?node_name=create',
      qna: '/api/topics/show.json?node_name=qna',
      jobs: '/api/topics/show.json?node_name=jobs',
      career: '/api/topics/show.json?node_name=career',
      python: '/api/topics/show.json?node_name=python'
    }
    expect(v2ex(answer('')).info.channels.map((channel) => channel.id)).toEqual(Object.keys(expected))
    for (const [channel, path] of Object.entries(expected)) {
      const { get, urls } = site({ '/api/': fixture('v2ex-node.json') })
      expect(await v2ex(get).list(channel, signal)).toHaveLength(3)
      expect(urls).toEqual([`https://www.v2ex.com${path}`])
    }
  })

  it('falls back to the post time and a made-up url, and drops an item it cannot read', async () => {
    const body = JSON.stringify([{ id: 8, title: 'a', created: 100, member: { username: 'm', avatar_normal: 'http://cdn.v2ex.com/x.png' } }, { title: 'no id' }, 'junk'])
    expect(await v2ex(answer(body)).list('latest', signal)).toEqual([
      { community: 'v2ex', id: '8', title: 'a', author: 'm', avatar: null, channel: null, replies: null, time: 100_000, url: 'https://www.v2ex.com/t/8' }
    ])
  })

  it('refuses an unknown channel without a request', async () => {
    const { get, urls } = site({})
    await expect(v2ex(get).list('nope', signal)).rejects.toThrow('没有这个板块')
    expect(urls).toEqual([])
  })
})

describe('v2ex thread', () => {
  const real = () => site({ '/api/topics/show.json?id=1257707': fixture('v2ex-topic.json'), '/api/replies/show.json?topic_id=1257707': fixture('v2ex-replies.json') })

  it('returns the opening at floor 0 and every reply with floor = index + 1', async () => {
    const { get, urls } = real()
    const thread = await v2ex(get).thread('1257707', 1, signal)
    expect(urls).toEqual(['https://www.v2ex.com/api/topics/show.json?id=1257707', 'https://www.v2ex.com/api/replies/show.json?topic_id=1257707'])
    expect(thread).toMatchObject({ page: 1, more: false })
    expect(thread.topic).toMatchObject({ id: '1257707', author: 'Tarrency', channel: '生活', replies: 347 })
    expect(thread.opening).toEqual({
      floor: 0,
      author: 'Tarrency',
      avatar: 'https://cdn.v2ex.com/avatar/878a/98cb/601093_large.png?m=1732081345',
      html: '<p>11.17，我的生日，知道的人不多，没人记得，难过。求一句生日祝福。</p>\n',
      time: 1794898813000,
      replyTo: null,
      likes: null
    })
    expect(thread.posts).toHaveLength(30)
    expect(thread.posts.map((post) => post.floor)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1))
    expect(thread.posts.every((post) => post.likes === null)).toBe(true)
  })

  it('points a reply at the nearest earlier reply by the name it mentions, with absolute links', async () => {
    const thread = await v2ex(real().get).thread('1257707', 1, signal)
    expect(thread.posts[0]).toMatchObject({ author: 'leehomyhh', replyTo: null, html: '可以，生日快乐！' })
    expect(thread.posts[1]).toMatchObject({ author: 'Tarrency', replyTo: 1 })
    expect(thread.posts[1]?.html).toContain('href="https://www.v2ex.com/member/leehomyhh"')
    expect(thread.posts[1]?.avatar).toBe('https://cdn.v2ex.com/avatar/878a/98cb/601093_large.png?m=1732081345')
  })

  it('takes the nearest of several earlier replies by the same name', async () => {
    const replies = [reply('a', 'one'), reply('b', 'two'), reply('a', 'three'), reply('c', mention('a', 'ok')), reply('c', mention('nobody')), reply('a', '@A plain')]
    const { get } = site({ 'show.json?id=5': topicBody, 'replies/show.json': JSON.stringify(replies) })
    const thread = await v2ex(get).thread('5', 1, signal)
    expect(thread.posts.map((post) => post.replyTo)).toEqual([null, null, null, 3, null, 3])
  })

  it('trusts a "#floor" after the mention when that floor is by that name', async () => {
    const replies = [reply('a', 'one'), reply('b', 'two'), reply('a', 'three'), reply('c', mention('a', '#1 yes')), reply('c', mention('a', '#2 wrong'))]
    const { get } = site({ 'show.json?id=5': topicBody, 'replies/show.json': JSON.stringify(replies) })
    const thread = await v2ex(get).thread('5', 1, signal)
    expect(thread.posts.map((post) => post.replyTo)).toEqual([null, null, null, 1, 3])
  })

  it('never points a reply at itself or at a later one', async () => {
    const replies = [reply('a', mention('a')), reply('b', mention('a')), reply('a', 'x')]
    const { get } = site({ 'show.json?id=5': topicBody, 'replies/show.json': JSON.stringify(replies) })
    expect((await v2ex(get).thread('5', 1, signal)).posts.map((post) => post.replyTo)).toEqual([null, 1, null])
  })

  it('returns no posts above page 1 and asks only for the topic', async () => {
    const { get, urls } = real()
    const thread = await v2ex(get).thread('1257707', 2, signal)
    expect(thread).toMatchObject({ opening: null, posts: [], page: 2, more: false })
    expect(thread.topic.id).toBe('1257707')
    expect(urls).toHaveLength(1)
  })

  it('says the topic does not exist when the array is empty or the status is 404', async () => {
    await expect(v2ex(site({ 'show.json?id=': '[]' }).get).thread('9', 1, signal)).rejects.toThrow('帖子不存在')
    await expect(v2ex(answer('', 404)).thread('9', 1, signal)).rejects.toThrow('帖子不存在')
  })

  it('keeps floors right around a reply it cannot read', async () => {
    const replies = [reply('a', 'one'), 'junk', reply('b', 'three')]
    const { get } = site({ 'show.json?id=5': topicBody, 'replies/show.json': JSON.stringify(replies) })
    const thread = await v2ex(get).thread('5', 1, signal)
    expect(thread.posts.map((post) => [post.floor, post.author])).toEqual([[1, 'a'], [2, ''], [3, 'b']])
  })
})

describe('v2ex errors', () => {
  it('says when the allowance comes back, from the reset header', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
    const reset = String(Date.parse('2026-11-17T12:07:30Z') / 1000)
    for (const status of [403, 429]) {
      const get = answer('', status, { 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': reset })
      await expect(v2ex(get).list('hot', signal)).rejects.toThrow('V2EX 的请求额度用完了，8 分钟后恢复')
      await expect(v2ex(get).thread('1', 1, signal)).rejects.toThrow('V2EX 的请求额度用完了，8 分钟后恢复')
    }
  })

  it('never says 0 minutes, and falls back without the header', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
    const past = String(Date.parse('2026-11-17T11:59:00Z') / 1000)
    await expect(v2ex(answer('', 429, { 'x-rate-limit-reset': past })).list('hot', signal)).rejects.toThrow('1 分钟后恢复')
    await expect(v2ex(answer('', 403)).list('hot', signal)).rejects.toThrow('V2EX 暂时拒绝了请求，过一会儿再试')
    await expect(v2ex(answer('', 429, { 'x-rate-limit-reset': 'soon' })).list('hot', signal)).rejects.toThrow('V2EX 暂时拒绝了请求，过一会儿再试')
  })

  it('is refused on the replies request too', async () => {
    const { get } = site({ 'show.json?id=5': topicBody, 'replies/show.json': { status: 429, headers: {}, body: '' } })
    await expect(v2ex(get).thread('5', 1, signal)).rejects.toThrow('V2EX 暂时拒绝了请求')
  })

  it('reports any other status', async () => {
    await expect(v2ex(answer('', 500)).list('hot', signal)).rejects.toThrow('V2EX 返回了 500')
  })

  it('reads a body that is not what was asked for as an Error, never a parse exception', async () => {
    const unreadable = 'V2EX 返回的内容读不懂'
    await expect(v2ex(answer('<html>x</html>')).list('hot', signal)).rejects.toThrow(unreadable)
    await expect(v2ex(answer('{"a":1}')).list('hot', signal)).rejects.toThrow(unreadable)
    await expect(v2ex(answer('<html>x</html>')).thread('1', 1, signal)).rejects.toThrow(unreadable)
    await expect(v2ex(answer('[{"id":"x"}]')).thread('1', 1, signal)).rejects.toThrow(unreadable)
    const { get } = site({ 'show.json?id=5': topicBody, 'replies/show.json': '{"a":1}' })
    await expect(v2ex(get).thread('5', 1, signal)).rejects.toThrow(unreadable)
  })
})
