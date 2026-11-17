import type { PageHost, PageTheme } from './host'
import { mockCommunities, mockList, mockThread } from './mock-data'
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

export function mockHost(): PageHost {
  const query = new URLSearchParams(location.search)
  const slow = Number(query.get('slow') ?? 500)
  const failing = query.get('error')
  const failedOnce = new Set<string>()
  let theme = mockTheme(query.get('theme') === 'dark' ? 'dark' : 'light')
  let state = initialState(query.get('state'))
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
      // Through JSON, as the real bridge carries it: what arrives is a copy, never the mock's own data.
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
