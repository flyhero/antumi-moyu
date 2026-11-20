import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CommunityId, CommunityInfo, ReplyLocation, Thread, Topic } from '../../src/community'
import type { PageHost } from './host'
import { callReader, errorMessage } from './reader-client'
import { markRead, readKey, savePosition, scopeKey, type ReadingPosition } from './saved-state'
import { sameTitleCovers, type TitleCover } from './title-disguise'
import { TtlCache } from './ttl-cache'
import type { PageState } from './use-page-state'
import { refreshOnExpiry } from './refresh-on-expiry'

// What the reader knows and how it asks the backend for more. The forums are asked little: one
// request for each thing the user does, lists kept 3 minutes and thread pages 5. A visible list
// refreshes once when its cache expires; failed requests wait for the user to retry.

const LIST_TTL = 3 * 60_000
const THREAD_TTL = 5 * 60_000

type Destination = ReplyLocation & { postId?: string; last?: boolean }
type CachedList = { topics: Topic[]; expiresAt: number }
export type ListState = { key: string; topics: Topic[] | null; loading: boolean; error: string | null; expiresAt: number | null }
export type ThreadState = {
  topic: Topic
  pages: Thread[]
  // The page on its way, if one is.
  loading: number | null
  error: { page: number; message: string } | null
  focus: { floor: number | null; offset: number; flash: boolean; ticket: number } | null
}
export type NextPage = 'loading' | 'last' | 'busy' | 'closed'

export function useReader(host: PageHost, store: PageState, onOpened: (thread: Thread, restoring: boolean) => void, account: string | null = null) {
  const saved = store.state
  const setSaved = store.update
  const [communities, setCommunities] = useState<CommunityInfo[] | null>(null)
  const [communitiesError, setCommunitiesError] = useState<string | null>(null)
  const [list, setList] = useState<ListState>({ key: '', topics: null, loading: false, error: null, expiresAt: null })
  const [thread, setThread] = useState<ThreadState | null>(null)
  const caches = useMemo(() => ({ lists: new TtlCache<CachedList>(LIST_TTL), threads: new TtlCache<Thread>(THREAD_TTL) }), [account])
  // A newer request makes an older one's answer moot.
  const tickets = useRef({ list: 0, thread: 0 })
  const retryThread = useRef<(() => void) | null>(null)
  const opened = useRef(onOpened)
  opened.current = onOpened

  // The forum last read, or the first there is: a plugin may read one alone.
  const community = communities?.find((one) => one.id === saved.community) ?? communities?.[0] ?? null
  const channel = community ? (community.channels.find((one) => one.id === saved.channel) ?? community.channels[0] ?? null) : null

  const loadCommunities = useCallback(() => {
    setCommunitiesError(null)
    callReader(host, 'communities', undefined).then(setCommunities, (error: unknown) => setCommunitiesError(errorMessage(error)))
  }, [host])
  useEffect(() => loadCommunities(), [loadCommunities])

  const loadList = useCallback((communityId: CommunityId, channelId: string, force: boolean) => {
    const key = `${account ?? ''}:${communityId}:${channelId}`
    const ticket = ++tickets.current.list
    const cached = force ? undefined : caches.lists.get(key)
    if (cached) {
      setList({ key, ...cached, loading: false, error: null })
      return
    }
    setList((previous) => ({ key, topics: previous.key === key ? previous.topics : null, loading: true, error: null, expiresAt: null }))
    host.call<Topic[]>('list', { community: communityId, channel: channelId, authenticated: account !== null }).then(
      (topics) => {
        const cached = { topics, expiresAt: Date.now() + LIST_TTL }
        caches.lists.set(key, cached)
        if (ticket === tickets.current.list) setList({ key, ...cached, loading: false, error: null })
      },
      (error: unknown) => {
        if (ticket === tickets.current.list) setList((previous) => ({ ...previous, key, loading: false, error: errorMessage(error) }))
      }
    )
  }, [host, caches, account])

  const communityId = community?.id
  const channelId = channel?.id
  useEffect(() => {
    if (communityId && channelId) loadList(communityId, channelId, false)
  }, [communityId, channelId, loadList])

  useEffect(() => {
    if (!communityId || !channelId || list.key !== `${account ?? ''}:${communityId}:${channelId}` || list.expiresAt === null) return
    return refreshOnExpiry(list.expiresAt, () => loadList(communityId, channelId, true))
  }, [communityId, channelId, list.key, list.expiresAt, loadList, account])

  const fetchPage = useCallback((topic: Topic, page: number, force: boolean, intent?: { replace?: boolean; position?: ReadingPosition; destination?: Destination }) => {
    retryThread.current = () => fetchPage(topic, page, true, intent)
    const ticket = ++tickets.current.thread
    const key = `${topic.community}:${topic.id}:${page}`
    const locate = intent?.destination !== undefined ? (intent.destination.floor ? { floor: intent.destination.floor } : intent.destination.last && !intent.destination.page ? { tail: true } : {}) : {}
    const apply = (result: Thread) => {
      if (ticket !== tickets.current.thread) return
      setThread((previous) => {
        if (!previous || previous.topic.id !== topic.id || previous.topic.community !== topic.community) return previous
        const pages = intent?.replace ? [result] : [...previous.pages.filter((one) => one.page !== result.page), result].sort((a, b) => a.page - b.page)
        const focus = intent?.destination !== undefined
          ? { floor: intent.destination.floor ?? (intent.destination.postId ? result.posts.find((post) => post.id === intent.destination?.postId)?.floor : undefined) ?? (intent.destination.last ? result.posts.at(-1)?.floor : result.opening?.floor ?? result.posts[0]?.floor) ?? null, offset: 0, flash: true, ticket }
          : intent?.position ? { ...intent.position, flash: false, ticket } : previous.focus
        return { topic: result.page === 1 ? result.topic : previous.topic, pages, loading: null, error: null, focus }
      })
      const floors = [result.opening?.floor ?? 0, ...result.posts.map((post) => post.floor)]
      setSaved((state) => markRead(state, readKey(topic.community, topic.id), Math.max(...floors)))
      if (intent?.replace) opened.current(result, Boolean(intent.position || intent.destination))
    }
    const cached = force || intent?.destination !== undefined ? undefined : caches.threads.get(key)
    if (cached) {
      apply(cached)
      return
    }
    setThread((previous) => (previous ? { ...previous, loading: page, error: null } : previous))
    host.call<Thread>('thread', { community: topic.community, id: topic.id, page, ...locate, authenticated: account !== null }).then(
      (result) => {
        caches.threads.set(`${topic.community}:${topic.id}:${result.page}`, result)
        apply(result)
      },
      (error: unknown) => {
        if (ticket !== tickets.current.thread) return
        setThread((previous) => (previous ? { ...previous, loading: null, error: { page, message: errorMessage(error) } } : previous))
      }
    )
  }, [host, caches, account, setSaved])

  const openTopic = (topic: Topic, force = false) => {
    const position = saved.positions[scopeKey(topic.community, account, topic.id)]
    const page = position?.page ?? 1
    setThread({ topic, pages: [], loading: page, error: null, focus: null })
    fetchPage(topic, page, force, { replace: true, position })
  }

  const currentTopic = useRef<Topic | null>(null)
  const previousAccount = useRef(account)
  currentTopic.current = thread?.topic ?? null
  useEffect(() => {
    if (previousAccount.current !== account) {
      if (previousAccount.current !== null || account === null) setThread(null)
      else if (currentTopic.current) openTopic(currentTopic.current, true)
    }
    previousAccount.current = account
    return () => { tickets.current.thread += 1; tickets.current.list += 1 }
  }, [account])

  const nextPage = (): NextPage => {
    if (!thread) return 'closed'
    if (thread.loading !== null) return 'busy'
    const last = thread.pages.at(-1)
    if (!last) return 'busy'
    if (!last.more) return 'last'
    fetchPage(thread.topic, last.page + 1, false)
    return 'loading'
  }

  const previousPage = () => {
    const first = thread?.pages[0]
    if (!thread || thread.loading !== null || !first || first.page <= 1) return
    fetchPage(thread.topic, first.page - 1, false, { position: saved.positions[scopeKey(thread.topic.community, account, thread.topic.id)] })
  }

  const openAt = (topic: Topic, location: Destination) => {
    const page = location.page ?? 1
    setThread({ topic, pages: [], loading: page, error: null, focus: null })
    fetchPage(topic, page, true, { replace: true, destination: location })
  }

  const showSent = (topic: Topic, location: ReplyLocation = {}) => {
    // Every previously cached page can be stale after a write.
    caches.threads.clear()
    openAt(topic, { ...location, last: true })
  }

  const refreshList = () => {
    if (list.loading) return
    if (community && channel) loadList(community.id, channel.id, true)
  }

  const refresh = () => {
    refreshList()
    if (thread) openTopic(thread.topic, true)
  }

  const retry = () => {
    if (communitiesError !== null) loadCommunities()
    if (list.error !== null && community && channel) loadList(community.id, channel.id, false)
    if (thread?.error) retryThread.current?.()
  }

  return {
    saved,
    communities,
    communitiesError,
    community,
    channel,
    list,
    thread,
    openTopic,
    nextPage,
    previousPage,
    showSent,
    openAt,
    positionKey: thread ? scopeKey(thread.topic.community, account, thread.topic.id) : null,
    rememberPosition: (key: string, position: ReadingPosition) => setSaved((state) => savePosition(state, key, position)),
    refresh,
    refreshList,
    retry,
    selectCommunity: (id: CommunityId) => setSaved((state) => (state.community === id ? state : { ...state, community: id, channel: null })),
    selectChannel: (id: string) => setSaved((state) => ({ ...state, channel: id })),
    setStream: (stream: boolean) => setSaved((state) => ({ ...state, stream })),
    setImages: (images: boolean) => setSaved((state) => ({ ...state, images })),
    setDisguiseAvatars: (disguiseAvatars: boolean) => setSaved((state) => ({ ...state, disguiseAvatars })),
    setDisguiseTitles: (disguiseTitles: boolean) => setSaved((state) => ({ ...state, disguiseTitles })),
    setTitleCovers: (titleCovers: TitleCover[]) => setSaved((state) => sameTitleCovers(state.titleCovers, titleCovers) ? state : { ...state, titleCovers })
  }
}

export type Reader = ReturnType<typeof useReader>
