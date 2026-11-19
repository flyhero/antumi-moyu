import { load } from 'cheerio/slim'
import type { Community, Post, Topic } from '../community.js'
import { absoluteLinks, absoluteUrl } from '../absolute-urls.js'
import { checkedSite, v2exAccount } from '../forum-session.js'
import type { Get } from '../http.js'
import { v2exReplyTarget } from './v2ex-reply-target.js'
import { v2ex } from './v2ex.js'

const ORIGIN = 'https://www.v2ex.com'
const timeOf = (value: string | undefined): number | null => {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : null
}

export function v2exSession(get: Get): Community {
  const info = v2ex(get).info
  return {
    info,
    async list(channel, signal) {
      if (!info.channels.some((known) => known.id === channel)) throw new Error('没有这个频道')
      const path = channel === 'hot' ? '/?tab=hot' : channel === 'latest' ? '/recent' : `/go/${channel}`
      const html = checkedSite(await get(ORIGIN + path, signal))
      if (!v2exAccount(html)) throw new Error('登录已过期，请重新登录')
      const $ = load(html)
      const topics: Topic[] = []
      $('#Main .cell.item, #TopicsNode .cell').each((_index, item) => {
        const row = $(item)
        const link = row.find('.item_title a[href^="/t/"]').first()
        const id = /^\/t\/(\d+)/.exec(link.attr('href') ?? '')?.[1]
        if (!id) return
        const author = row.find('a[href^="/member/"]').filter((_index, item) => $(item).text().trim() !== '').first().text().trim()
        const replies = Number(row.find('.count_livid, .count_orange').first().text().trim())
        topics.push({ community: 'v2ex', id, title: link.text().trim(), author,
          avatar: absoluteUrl(row.find('img.avatar').first().attr('src'), ORIGIN),
          channel: row.find('a.node').first().text().trim() || null,
          replies: Number.isFinite(replies) ? replies : null,
          time: timeOf(row.find('.ago').first().attr('title')), url: `${ORIGIN}/t/${id}` })
      })
      if (!$('#Main').length) throw new Error('V2EX 返回的内容读不懂，请在浏览器检查登录')
      return topics
    },
    async thread(id, page, signal, focus) {
      let first: string | undefined
      if (focus?.floor) page = Math.ceil(focus.floor / 100)
      if (focus?.tail) {
        first = checkedSite(await get(`${ORIGIN}/t/${id}?p=1`, signal))
        if (!v2exAccount(first)) throw new Error('登录已过期，请重新登录')
        const $ = load(first)
        const numbers = $('a.page_normal, a.page_current').map((_i, item) => Number($(item).text().trim())).get().filter((value) => Number.isInteger(value) && value >= 1 && value <= 1000)
        page = Math.max(1, ...numbers)
      }
      const html = first && page === 1 ? first : checkedSite(await get(`${ORIGIN}/t/${id}?p=${page}`, signal))
      if (!v2exAccount(html)) throw new Error('登录已过期，请重新登录')
      const $ = load(html)
      const header = $('#Main .header').first()
      const title = header.find('h1').text().trim()
      if (!title) throw new Error('帖子不存在、需要登录，或当前账号无权查看')
      const author = header.find('a[href^="/member/"]').filter((_index, item) => $(item).text().trim() !== '').first().text().trim()
      const avatar = absoluteUrl(header.find('img.avatar').attr('src'), ORIGIN)
      const topic: Topic = { community: 'v2ex', id, title, author, avatar, channel: header.find('a[href^="/go/"]').first().text().trim() || null,
        replies: null, time: timeOf(header.find('.ago').first().attr('title')), url: `${ORIGIN}/t/${id}` }
      const posts: Post[] = []
      $('.cell[id^="r_"]').each((_index, item) => {
        const row = $(item)
        const floor = Number(row.find('.no').first().text().trim())
        if (!Number.isInteger(floor) || floor < 1) return
        posts.push({ id: row.attr('id')?.slice(2), floor, author: row.find('a.dark[href^="/member/"]').first().text().trim(),
          avatar: absoluteUrl(row.find('img.avatar').first().attr('src'), ORIGIN),
          html: absoluteLinks(row.find('.reply_content').first().html() ?? '', ORIGIN),
          time: timeOf(row.find('.ago').first().attr('title')), replyTo: null, likes: null })
      })
      const authors = new Map(posts.map((post) => [post.floor, post.author]))
      for (const post of posts) post.replyTo = v2exReplyTarget(post.html, post.floor, authors)
      const more = $('a.page_normal').toArray().some((item) => Number($(item).text().trim()) > page)
      const opening: Post | null = page === 1 ? { floor: 0, author, avatar,
        html: absoluteLinks([$('.topic_content').first().html() ?? '', ...$('#Main .subtle .topic_content').map((_i, item) => $(item).html() ?? '').get()].join('\n'), ORIGIN),
        time: topic.time, replyTo: null, likes: null } : null
      return { topic, opening, posts, page, more }
    }
  }
}
