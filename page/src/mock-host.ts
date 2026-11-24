import { LikeParams, ReplyParams, UploadParams, type CommunityId, type Post } from '../../src/community'
import type { PageHost, PageTheme } from './host'
import { mockCommunities, mockList, mockThread } from './mock-data'
import { mockNotifications } from './mock-notifications'
import { mockTheme } from './mock-palette'
import { isCommunityId } from './saved-state'

// The host when the page is opened as a plain web page (the preview): forum data from mock-data, the
// app's tokens from mock-palette. The address steers it:
//   ?theme=dark            start dark; Alt+T flips the theme at any time
//   ?lang=en               English
//   ?slow=1500             every call takes this long (ms, default 500)
//   ?error=list|thread|communities|all   those calls fail, every time
//   ?error=once            each method fails on its first call only, to try retrying
//   ?state={...}           what the page kept last time, as JSON
//   ?only=v2ex             one forum alone, as either plugin has it

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const FAILURES: Record<string, string> = {
  communities: '插件后端没有启动：node 进程已退出（代码 1）',
  list: 'linux.do 要求浏览器验证（Cloudflare），暂时取不到列表，稍后再试',
  thread: '读取超时：论坛 15 秒没有回应'
}

function answer(method: string, params: unknown, now: number): unknown {
  if (method === 'communities') {
    const only = new URLSearchParams(location.search).get('only')
    const some = mockCommunities.filter((one) => one.id === only)
    return some.length > 0 ? some : mockCommunities
  }
  if (!isRecord(params) || !isCommunityId(params.community)) throw new Error(`bad params for ${method}`)
  if (method === 'list' && typeof params.channel === 'string') return mockList(params.community, params.channel, now)
  if (method === 'thread' && typeof params.id === 'string') {
    const page = typeof params.page === 'number' ? params.page : 1
    return mockThread(params.community, params.id, page, now)
  }
  throw new Error(`unknown method ${method}`)
}

function initialState(text: string | null): unknown {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function lastFloor(community: CommunityId, id: string, added: Post[]): number {
  let page = mockThread(community, id, 1, Date.now(), added)
  while (page.more) page = mockThread(community, id, page.page + 1, Date.now(), added)
  return page.posts.at(-1)?.floor ?? page.opening?.floor ?? 0
}

export function mockHost(): PageHost {
  const query = new URLSearchParams(location.search)
  const slow = Number(query.get('slow') ?? 500)
  const failing = query.get('error')
  const failedOnce = new Set<string>()
  let theme = mockTheme(query.get('theme') === 'dark' ? 'dark' : 'light')
  let state = initialState(query.get('state'))
  let signedIn = query.get('signedin') === 'true'
  let unread = 3
  const readNotifications = new Set<string>()
  const posted = new Map<string, Post[]>()
  const listeners = new Set<(theme: PageTheme) => void>()

  const apply = () => {
    const root = document.documentElement
    for (const [name, value] of Object.entries(theme.variables)) root.style.setProperty(name, value)
    root.style.colorScheme = theme.scheme
  }
  apply()
  window.addEventListener('keydown', (event) => {
    if (!event.altKey || event.code !== 'KeyT') return
    event.preventDefault()
    theme = mockTheme(theme.scheme === 'dark' ? 'light' : 'dark')
    apply()
    for (const listener of listeners) listener(theme)
  })

  return {
    async call<T>(method: string, params?: unknown): Promise<T> {
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(slow) ? slow : 500))
      const fails = failing === 'all' || failing === method || (failing === 'once' && !failedOnce.has(method))
      if (fails) {
        failedOnce.add(method)
        throw new Error(FAILURES[method] ?? '出错了')
      }
      if (method === 'thread' && (failing === 'rate-limit' || failing === 'challenge') && !failedOnce.has('refusal')) {
        failedOnce.add('refusal')
        throw new Error(failing === 'challenge' ? '社区要求 Cloudflare 验证，请在插件登录浏览器中完成验证后检查状态' : '请求过于频繁，请 5 秒后再试')
      }
      // Through JSON, as the real bridge carries it: what arrives is a copy, never the mock's own data.
      if (method === 'session') return JSON.parse(JSON.stringify(signedIn ? { username: 'preview-reader', unreadNotifications: unread } : null))
      if (method === 'login') { signedIn = true; return JSON.parse('{"opened":true}') }
      if (method === 'logout') { signedIn = false; return JSON.parse('{"disconnected":true}') }
      if (method === 'notifications' || method === 'notificationRead') {
        if (!signedIn) throw new Error('请先登录后查看通知')
        if (!isRecord(params) || params.account !== 'preview-reader') throw new Error('账号不匹配')
        if (method === 'notificationRead') {
          if (typeof params.id !== 'string') throw new Error('缺少通知编号')
          if (!readNotifications.has(params.id)) unread = Math.max(0, unread - 1)
          readNotifications.add(params.id)
          return JSON.parse('{"read":true}')
        }
        const selected = query.get('only')
        const community = isCommunityId(selected) ? selected : isRecord(state) && isCommunityId(state.community) ? state.community : 'linuxdo'
        if (community === 'v2ex') unread = 0
        const page = typeof params.page === 'number' ? params.page : 1
        return JSON.parse(JSON.stringify(mockNotifications(community, page, Date.now(), readNotifications, unread)))
      }
      if (method === 'notificationWatch') {
        if (!signedIn) return JSON.parse('{"state":"login","message":"请先登录后接收通知"}')
        if (!isRecord(params) || params.account !== 'preview-reader') throw new Error('账号不匹配')
        const selected = query.get('only')
        const community = isCommunityId(selected) ? selected : isRecord(state) && isCommunityId(state.community) ? state.community : 'linuxdo'
        return JSON.parse(JSON.stringify({ state: 'ok', account: { username: 'preview-reader', unreadNotifications: unread, ...(community === 'linuxdo' ? { userId: 7 } : {}) },
          ...(community === 'linuxdo' ? { cursor: typeof params.cursor === 'number' ? params.cursor : 100 } : {}), changed: false, interval: community === 'linuxdo' ? 3000 : 180000 }))
      }
      if (method === 'upload') {
        if (!signedIn) return JSON.parse('{"state":"failed","failure":{"kind":"login","message":"请先登录"}}')
        const picture = UploadParams.parse(params)
        console.info('[mock host] upload', picture.name, picture.type, Math.round(picture.data.length * 3 / 4))
        return JSON.parse(JSON.stringify({ state: 'done', markdown: `![${picture.name}](upload://preview${Date.now()}.${picture.type.split('/')[1]})` }))
      }
      if (method === 'like') {
        if (!signedIn) return JSON.parse('{"state":"failed","failure":{"kind":"login","message":"请先登录"}}')
        const like = LikeParams.parse(params)
        console.info('[mock host] like', like.post, like.liked)
        return JSON.parse(JSON.stringify({ state: 'done', liked: like.liked, likes: null }))
      }
      if (method === 'reply') {
        if (!signedIn) return JSON.parse('{"state":"failed","failure":{"kind":"login","message":"请先登录"}}')
        const failure = query.get('replyerror')
        if (['login', 'rate-limit', 'unconfirmed', 'rejected'].includes(failure ?? '')) return JSON.parse(JSON.stringify({ state: 'failed', failure: { kind: failure, message: failure === 'login' ? '登录已过期' : failure === 'rate-limit' ? '请求过于频繁' : failure === 'unconfirmed' ? '发送结果未确认，草稿已保留' : '社区未接受这条回复', ...(failure === 'rate-limit' ? { retryAfter: 5 } : {}) } }))
        if (failure === 'pending') return JSON.parse('{"state":"pending","message":"回复已提交，等待社区审核"}')
        const reply = ReplyParams.parse(params)
        console.info('[mock host] reply', reply.id, reply.target ?? null)
        const selected = query.get('only')
        const community = isCommunityId(selected) ? selected : isRecord(state) && isCommunityId(state.community) ? state.community : 'linuxdo'
        const key = `${community}:${reply.id}`
        const added = posted.get(key) ?? []
        const last = lastFloor(community, reply.id, added)
        const html = reply.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        const post: Post = { id: String(Date.now()), floor: last + 1, author: 'preview-reader', avatar: null, html: `<p>${html}</p>`, time: Date.now(), replyTo: reply.target?.floor ?? null, likes: 0, byAuthor: false }
        posted.set(key, [...added, post])
        return JSON.parse(JSON.stringify({ state: 'sent', message: null, location: { postId: post.id, floor: post.floor }, post }))
      }
      if (method === 'thread' && isRecord(params) && isCommunityId(params.community) && typeof params.id === 'string') {
        const added = posted.get(`${params.community}:${params.id}`) ?? []
        const floor = typeof params.floor === 'number' ? params.floor : params.tail ? lastFloor(params.community, params.id, added) : null
        const page = floor !== null ? params.community === 'linuxdo' ? Math.ceil(floor / 20) : 1 : typeof params.page === 'number' ? params.page : 1
        console.info('[mock host] thread', params.id, page, floor)
        return JSON.parse(JSON.stringify(mockThread(params.community, params.id, page, Date.now(), added)))
      }
      return JSON.parse(JSON.stringify(answer(method, params, Date.now())))
    },
    get theme() {
      return theme
    },
    locale: query.get('lang') === 'en' ? 'en' : 'zh-CN',
    get state() {
      return state
    },
    setState(value) {
      if (new TextEncoder().encode(JSON.stringify(value)).length > 32 * 1024) throw new Error('Page storage is full')
      state = JSON.parse(JSON.stringify(value))
      console.info('[mock host] setState', JSON.stringify(value).length, 'bytes', value)
    },
    onTheme(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    open(url) {
      console.info('[mock host] open', url)
    },
    leave() {
      console.info('[mock host] leave')
      document.body.replaceChildren()
      document.title = 'left'
    }
  }
}
