import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CommunityId, CommunityInfo, Thread, Topic } from '../../src/community'
import type { PageHost } from './host'
import { callReader, errorMessage } from './reader-client'
import { markRead, readKey, readSavedState, type SavedState } from './saved-state'
import { TtlCache } from './ttl-cache'
import { refreshOnExpiry } from './refresh-on-expiry'

// What the reader knows and how it asks the backend for more. The forums are asked little: one
// request for each thing the user does, lists kept 3 minutes and thread pages 5. A visible list
// refreshes once when its cache expires; failed requests wait for the user to retry.

const LIST_TTL = 3 * 60_000
const THREAD_TTL = 5 * 60_000

type CachedList = { topics: Topic[]; expiresAt: number }
export type ListState = { key: string; topics: Topic[] | null; loading: boolean; error: string | null; expiresAt: number | null }
export type ThreadState = {
  topic: Topic
  pages: Thread[]
  // The page on its way, if one is.
  loading: number | null
  error: { page: number; message: string } | null
}
export type NextPage = 'loading' | 'last' | 'busy' | 'closed'

export function useReader(host: PageHost, onOpened: (thread: Thread) => void) {
  const [saved, setSaved] = useState<SavedState>(() => readSavedState(host.state))
  const [communities, setCommunities] = useState<CommunityInfo[] | null>(null)
  const [communitiesError, setCommunitiesError] = useState<string | null>(null)
  const [list, setList] = useState<ListState>({ key: '', topics: null, loading: false, error: null, expiresAt: null })
  const [thread, setThread] = useState<ThreadState | null>(null)
  const caches = useMemo(() => ({ lists: new TtlCache<CachedList>(LIST_TTL), threads: new TtlCache<Thread>(THREAD_TTL) }), [])
  // A newer request makes an older one's answer moot.
  const tickets = useRef({ list: 0, thread: 0 })
  const opened = useRef(onOpened)
  opened.current = onOpened

  const restored = useRef(true)
  useEffect(() => {
    if (restored.current) {
      restored.current = false
      return
    }
    host.setState(saved)
  }, [host, saved])

  // The forum last read, or the first there is: a plugin may read one alone.
  const community = communities?.find((one) => one.id === saved.community) ?? communities?.[0] ?? null
  const channel = community ? (community.channels.find((one) => one.id === saved.channel) ?? community.channels[0] ?? null) : null

  const loadCommunities = useCallback(() => {
    setCommunitiesError(null)
    callReader(host, 'communities', undefined).then(setCommunities, (error: unknown) => setCommunitiesError(errorMessage(error)))
  }, [host])
  useEffect(() => loadCommunities(), [loadCommunities])

  const loadList = useCallback((communityId: CommunityId, channelId: string, force: boolean) => {
    const key = `${communityId}:${channelId}`
    const ticket = ++tickets.current.list
    const cached = force ? undefined : caches.lists.get(key)
    if (cached) {
      setList({ key, ...cached, loading: false, error: null })
      return
    }
    setList((previous) => ({ key, topics: previous.key === key ? previous.topics : null, loading: true, error: null, expiresAt: null }))
    callReader(host, 'list', { community: communityId, channel: channelId }).then(
      (topics) => {
        const cached = { topics, expiresAt: Date.now() + LIST_TTL }
        caches.lists.set(key, cached)
        if (ticket === tickets.current.list) setList({ key, ...cached, loading: false, error: null })
      },
      (error: unknown) => {
        if (ticket === tickets.current.list) setList((previous) => ({ ...previous, key, loading: false, error: errorMessage(error) }))
      }
    )
  }, [host, caches])

  const communityId = community?.id
  const channelId = channel?.id
  useEffect(() => {
    if (communityId && channelId) loadList(communityId, channelId, false)
  }, [communityId, channelId, loadList])

  useEffect(() => {
    if (!communityId || !channelId || list.key !== `${communityId}:${channelId}` || list.expiresAt === null) return
    return refreshOnExpiry(list.expiresAt, () => loadList(communityId, channelId, true))
  }, [communityId, channelId, list.key, list.expiresAt, loadList])

  const fetchPage = useCallback((topic: Topic, page: number, force: boolean) => {
    const ticket = ++tickets.current.thread
    const key = `${topic.community}:${topic.id}:${page}`
    const apply = (result: Thread) => {
      if (ticket !== tickets.current.thread) return
      setThread((previous) => {
        if (!previous || previous.topic.id !== topic.id || previous.topic.community !== topic.community) return previous
        const pages = page === 1 ? [result] : [...previous.pages.filter((one) => one.page < page), result]
        return { topic: page === 1 ? result.topic : previous.topic, pages, loading: null, error: null }
      })
      const floors = [result.opening?.floor ?? 0, ...result.posts.map((post) => post.floor)]
      setSaved((state) => markRead(state, readKey(topic.community, topic.id), Math.max(...floors)))
      if (page === 1) opened.current(result)
    }
    const cached = force ? undefined : caches.threads.get(key)
    if (cached) {
      apply(cached)
      return
    }
    setThread((previous) => (previous ? { ...previous, loading: page, error: null } : previous))
    callReader(host, 'thread', { community: topic.community, id: topic.id, page }).then(
      (result) => {
        caches.threads.set(key, result)
        apply(result)
      },
      (error: unknown) => {
        if (ticket !== tickets.current.thread) return
        setThread((previous) => (previous ? { ...previous, loading: null, error: { page, message: errorMessage(error) } } : previous))
      }
    )
  }, [host, caches])

  const openTopic = (topic: Topic, force = false) => {
    setThread({ topic, pages: [], loading: 1, error: null })
    fetchPage(topic, 1, force)
  }

  const nextPage = (): NextPage => {
    if (!thread) return 'closed'
    if (thread.loading !== null) return 'busy'
    const last = thread.pages.at(-1)
    if (!last) return 'busy'
    if (!last.more) return 'last'
    fetchPage(thread.topic, last.page + 1, false)
    return 'loading'
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
    if (thread?.error) fetchPage(thread.topic, thread.error.page, false)
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
    refresh,
    refreshList,
    retry,
    selectCommunity: (id: CommunityId) => setSaved((state) => (state.community === id ? state : { ...state, community: id, channel: null })),
    selectChannel: (id: string) => setSaved((state) => ({ ...state, channel: id })),
    setStream: (stream: boolean) => setSaved((state) => ({ ...state, stream })),
    setImages: (images: boolean) => setSaved((state) => ({ ...state, images }))
  }
}

export type Reader = ReturnType<typeof useReader>
