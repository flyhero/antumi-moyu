import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Get, HttpResponse } from '../http.js'
import { linuxdo } from './linuxdo.js'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
const signal = new AbortController().signal

function answer(body: string, status = 200, headers: Record<string, string> = {}): Get {
  return async () => ({ status, headers, body })
}

function recorder(response: HttpResponse): { get: Get; urls: string[] } {
  const urls: string[] = []
  return { urls, get: async (url) => (urls.push(url), response) }
}

const topicJson = (posts: object[], stream: number[], extra: object = {}) =>
  JSON.stringify({ id: 7, title: 'T', posts_count: stream.length, created_at: '2026-01-01T00:00:00.000Z', post_stream: { posts, stream }, ...extra })
const post = (id: number, number: number, extra: object = {}) => ({
  id, post_number: number, username: `u${number}`, avatar_template: '/user_avatar/linux.do/u/{size}/1.png', created_at: '2026-01-01T00:00:00.000Z',
  cooked: `<p>${number}</p>`, post_type: 1, reply_to_post_number: null, reaction_users_count: 0, actions_summary: [], hidden: false, deleted_at: null, user_deleted: false, ...extra
})

describe('linuxdo list', () => {
  it('maps a latest feed to topics', async () => {
    const { get, urls } = recorder({ status: 200, headers: {}, body: fixture('linuxdo-latest.rss') })
    const topics = await linuxdo(get).list('latest', signal)
    expect(urls).toEqual(['https://linux.do/latest.rss'])
    expect(topics).toHaveLength(5)
    expect(topics[0]).toEqual({
      community: 'linuxdo',
      id: '3192714',
      title: '开了个Google Ultra 20x，有什么隐藏权益可以领以及正常用argon周限有多少刀',
      author: 'inm',
      avatar: null,
      channel: '搞七捻三',
      replies: 0,
      time: Date.UTC(2026, 10, 17, 13, 12, 34),
      url: 'https://linux.do/t/topic/3192714'
    })
    // "4 个帖子" is the opening post and three replies.
    expect(topics[1]).toMatchObject({ id: '3192712', author: '狐狐漱漱', channel: '开发调优', replies: 3 })
  })

  it('reads the category and top feeds the same way', async () => {
    expect(await linuxdo(answer(fixture('linuxdo-category.rss'))).list('develop', signal)).toHaveLength(3)
    const top = await linuxdo(answer(fixture('linuxdo-top.rss'))).list('top', signal)
    expect(top).toHaveLength(3)
    expect(top.every((topic) => /^\d+$/.test(topic.id) && topic.url.startsWith('https://linux.do/t/'))).toBe(true)
  })

  it('asks for the path of each channel', async () => {
    const expected: Record<string, string> = {
      latest: '/latest.rss',
      top: '/top.rss?period=daily',
      develop: '/c/develop/4.rss',
      gossip: '/c/gossip/11.rss',
      resource: '/c/resource/14.rss',
      welfare: '/c/welfare/36.rss',
      news: '/c/news/34.rss'
    }
    const forum = linuxdo(answer(''))
    expect(forum.info.channels.map((channel) => channel.id)).toEqual(Object.keys(expected))
    for (const [channel, path] of Object.entries(expected)) {
      const { get, urls } = recorder({ status: 200, headers: {}, body: fixture('linuxdo-latest.rss') })
      await linuxdo(get).list(channel, signal)
      expect(urls).toEqual([`https://linux.do${path}`])
    }
  })

  it('skips items without a topic link and leaves unknown counts null', async () => {
    const feed = `<rss><channel>
      <item><title>no link</title></item>
      <item><title>bare</title><link>https://linux.do/t/topic/9</link></item>
    </channel></rss>`
    expect(await linuxdo(answer(feed)).list('latest', signal)).toEqual([
      { community: 'linuxdo', id: '9', title: 'bare', author: '', avatar: null, channel: null, replies: null, time: null, url: 'https://linux.do/t/topic/9' }
    ])
  })

  it('refuses an unknown channel without a request', async () => {
    const { get, urls } = recorder({ status: 200, headers: {}, body: '' })
    await expect(linuxdo(get).list('nope', signal)).rejects.toThrow('没有这个板块')
    expect(urls).toEqual([])
  })
})

describe('linuxdo thread', () => {
  it('maps a one-post topic to its opening', async () => {
    const { get, urls } = recorder({ status: 200, headers: {}, body: fixture('linuxdo-topic.json') })
    const thread = await linuxdo(get).thread('3192714', 1, signal)
    expect(urls).toEqual(['https://linux.do/t/topic/3192714.json'])
    expect(thread.page).toBe(1)
    expect(thread.more).toBe(false)
    expect(thread.posts).toEqual([])
    expect(thread.opening).toMatchObject({ floor: 1, author: 'inm', replyTo: null, likes: 0, byAuthor: true, time: Date.parse('2026-11-17T13:12:34.566Z') })
    expect(thread.opening?.avatar).toBe('https://cdn.ldstatic.com/user_avatar/linux.do/inm/96/2487393_2.png')
    expect(thread.topic).toEqual({
      community: 'linuxdo',
      id: '3192714',
      title: '开了个Google Ultra 20x，有什么隐藏权益可以领以及正常用argon周限有多少刀',
      author: 'inm',
      avatar: 'https://cdn.ldstatic.com/user_avatar/linux.do/inm/96/2487393_2.png',
      channel: null,
      replies: 0,
      time: Date.parse('2026-11-17T13:12:34.566Z'),
      url: 'https://linux.do/t/topic/3192714'
    })
  })

  it('maps page 2: floors from post_number, no opening, more while the stream goes on', async () => {
    const { get, urls } = recorder({ status: 200, headers: {}, body: fixture('linuxdo-topic-page2.json') })
    const thread = await linuxdo(get).thread('1', 2, signal)
    expect(urls).toEqual(['https://linux.do/t/topic/1.json?page=2'])
    expect(thread.opening).toBeNull()
    expect(thread.posts).toHaveLength(20)
    expect(thread.posts[0]).toMatchObject({ floor: 22, author: 'prya', likes: 2, replyTo: null, byAuthor: false })
    expect(thread.posts[0]?.avatar).toBe('https://cdn.ldstatic.com/letter_avatar/prya/96/6_449c533f586939b6e5f246632a46421f.png')
    // Emoji in the post come from the CDN too, and links into the forum stay on linux.do.
    expect(thread.posts.some((post) => post.html.includes('https://cdn.ldstatic.com/images/emoji/'))).toBe(true)
    expect(thread.posts.every((post) => !post.html.includes('https://linux.do/images/emoji/'))).toBe(true)
    expect(thread.posts.map((p) => p.floor)).toEqual([...thread.posts.map((p) => p.floor)].sort((a, b) => a - b))
    // 58 posts in the stream, 40 seen so far.
    expect(thread.more).toBe(true)
    expect(thread.posts.find((post) => post.floor === 24)?.byAuthor).toBe(true)
    expect(thread.topic).toMatchObject({ id: '1', author: 'Nginx', replies: 57, url: 'https://linux.do/t/topic/1' })
  })

  it('is on its last page when the stream ends there', async () => {
    const stream = [11, 12, 13]
    const body = topicJson([post(11, 1), post(12, 2), post(13, 4, { reply_to_post_number: 2, reaction_users_count: 5 })], stream)
    const thread = await linuxdo(answer(body)).thread('7', 1, signal)
    expect(thread.more).toBe(false)
    expect(thread.opening?.floor).toBe(1)
    expect(thread.posts.map((p) => p.floor)).toEqual([2, 4])
    expect(thread.posts[1]).toMatchObject({ replyTo: 2, likes: 5, byAuthor: false })
  })

  it('marks a reply by account id, including on a later page that has no opening post', async () => {
    const owned = { user_id: 7, username: 'same' }
    const other = { user_id: 8, username: 'same' }
    const topic = { user_id: 7, details: { created_by: { id: 7, username: 'same' } } }
    const first = topicJson([post(11, 1, owned), post(12, 2, other), post(13, 3, owned)], [11, 12, 13], topic)
    const opened = await linuxdo(answer(first)).thread('7', 1, signal)
    expect(opened.opening?.byAuthor).toBe(true)
    expect(opened.posts.map((item) => item.byAuthor)).toEqual([false, true])
    const later = topicJson([post(21, 21, owned), post(22, 22, other)], Array.from({ length: 40 }, (_, index) => index + 1), topic)
    const page = await linuxdo(answer(later)).thread('7', 2, signal)
    expect(page.opening).toBeNull()
    expect(page.topic.author).toBe('same')
    expect(page.posts.map((item) => item.byAuthor)).toEqual([true, false])
  })

  it('is not at its end when only part of the stream is loaded', async () => {
    const body = topicJson([post(11, 1), post(12, 2)], [11, 12, 13, 14])
    expect((await linuxdo(answer(body)).thread('7', 1, signal)).more).toBe(true)
  })

  it('skips small actions, hidden, deleted and user-deleted posts, but a skipped last post still counts for position', async () => {
    const body = topicJson(
      [post(11, 1), post(12, 2, { post_type: 3 }), post(13, 3, { hidden: true }), post(14, 4, { deleted_at: '2026-01-02T00:00:00.000Z' }), post(15, 5, { user_deleted: true }), post(16, 6)],
      [11, 12, 13, 14, 15, 16]
    )
    const thread = await linuxdo(answer(body)).thread('7', 1, signal)
    expect(thread.posts.map((p) => p.floor)).toEqual([6])
    expect(thread.more).toBe(false)
  })

  it('has no opening when the first post is not readable', async () => {
    const body = topicJson([post(11, 1, { hidden: true }), post(12, 2)], [11, 12])
    const thread = await linuxdo(answer(body)).thread('7', 1, signal)
    expect(thread.opening).toBeNull()
    expect(thread.posts.map((p) => p.floor)).toEqual([2])
  })

  it('counts likes from the actions when reactions are absent', async () => {
    const { reaction_users_count: _omitted, ...reaction } = post(11, 1, { actions_summary: [{ id: 2, count: 4 }, { id: 4, count: 9 }] })
    const thread = await linuxdo(answer(topicJson([reaction], [11]))).thread('7', 1, signal)
    expect(thread.opening?.likes).toBe(4)
  })

  it('makes relative links in the post absolute', async () => {
    const cooked = '<p><a href="/u/x">x</a> <img src="/uploads/a.png"> <img src="//cdn.example.com/b.png"> <a href="https://a.com">a</a></p>'
    const thread = await linuxdo(answer(topicJson([post(11, 1, { cooked })], [11]))).thread('7', 1, signal)
    expect(thread.opening?.html).toBe('<p><a href="https://linux.do/u/x">x</a> <img src="https://linux.do/uploads/a.png"> <img src="https://cdn.example.com/b.png"> <a href="https://a.com">a</a></p>')
  })

  it('keeps an avatar that is already absolute', async () => {
    const body = topicJson([post(11, 1, { avatar_template: 'https://cdn.example.com/a/{size}/1.png' })], [11])
    expect((await linuxdo(answer(body)).thread('7', 1, signal)).opening?.avatar).toBe('https://cdn.example.com/a/96/1.png')
  })
})

describe('linuxdo reply location', () => {
  it('locates the correct page by stream position, not a floor with deleted gaps', async () => {
    const stream = Array.from({ length: 25 }, (_, index) => index + 100)
    const urls: string[] = []
    const get: Get = async (url) => {
      urls.push(url)
      const body = url.includes('/80.json') ? topicJson([post(122, 80)], stream) : topicJson([post(120, 78), post(122, 80), post(124, 82)], stream)
      return { body, headers: {}, status: 200 }
    }
    const result = await linuxdo(get).thread('7', 1, signal, { floor: 80 })
    expect(result.page).toBe(2)
    expect(result.posts.some((post) => post.floor === 80)).toBe(true)
    expect(urls).toEqual(['https://linux.do/t/7/80.json', 'https://linux.do/t/topic/7.json?page=2'])
  })

  it('loads the last page in two reads without walking the whole topic', async () => {
    const stream = Array.from({ length: 45 }, (_, index) => index + 100)
    const urls: string[] = []
    const get: Get = async (url) => { urls.push(url); return { body: topicJson([post(144, 45)], stream), headers: {}, status: 200 } }
    const result = await linuxdo(get).thread('7', 1, signal, { tail: true })
    expect(result.page).toBe(3)
    expect(urls).toEqual(['https://linux.do/t/topic/7.json', 'https://linux.do/t/topic/7.json?page=3'])
  })
})

describe('linuxdo errors', () => {
  const challenge = fixture('cloudflare-challenge.html')
  const blocked = 'linux.do 暂时拦住了请求，过一会儿再试'

  it('names the Cloudflare challenge on a list and on a thread', async () => {
    await expect(linuxdo(answer(challenge, 403, { 'cf-mitigated': 'challenge' })).list('latest', signal)).rejects.toThrow(blocked)
    await expect(linuxdo(answer(challenge, 403)).thread('1', 1, signal)).rejects.toThrow(blocked)
    await expect(linuxdo(answer('', 429)).thread('1', 1, signal)).rejects.toThrow(blocked)
    await expect(linuxdo(answer('', 200, { 'cf-mitigated': 'challenge' })).list('latest', signal)).rejects.toThrow(blocked)
    await expect(linuxdo(answer(challenge, 200)).list('latest', signal)).rejects.toThrow(blocked)
  })

  it('says a missing topic does not exist or needs a login', async () => {
    await expect(linuxdo(answer('{}', 404)).thread('1', 1, signal)).rejects.toThrow('帖子不存在，或者需要登录才能看')
  })

  it('reports any other status', async () => {
    await expect(linuxdo(answer('', 502)).thread('1', 1, signal)).rejects.toThrow('linux.do 返回了 502')
    await expect(linuxdo(answer('', 404)).list('latest', signal)).rejects.toThrow('linux.do 返回了 404')
  })

  it('reads a body that is not what was asked for as an Error, never a parse exception', async () => {
    const unreadable = 'linux.do 返回的内容读不懂'
    await expect(linuxdo(answer('<html>hello</html>')).thread('1', 1, signal)).rejects.toThrow(unreadable)
    await expect(linuxdo(answer('{"id":1}')).thread('1', 1, signal)).rejects.toThrow(unreadable)
    await expect(linuxdo(answer('{"id":1,"title":"x","post_stream":{"posts":[{"post_number":"one"}]}}')).thread('1', 1, signal)).rejects.toThrow(unreadable)
    await expect(linuxdo(answer('<html>hello</html>')).list('latest', signal)).rejects.toThrow(unreadable)
  })
})
