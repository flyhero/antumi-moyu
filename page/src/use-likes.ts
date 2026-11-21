import { useRef, useState } from 'preact/hooks'
import { LikeResult, type Post, type Topic } from '../../src/community'
import type { PageHost } from './host'
import { callReader, errorMessage } from './reader-client'

type Change = { liked: boolean; likes: number | null }
const keyOf = (topic: Topic, post: Post) => `${topic.community}:${topic.id}:${post.id}`

// Likes the reader gave on this visit, laid over the thread until a reload brings the forum's own word.
export function useLikes(host: PageHost, topic: Topic | null, username: string | null, onFailure: (message: string) => void) {
  const [changes, setChanges] = useState<ReadonlyMap<string, Change>>(new Map())
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const inFlight = useRef(new Set<string>())

  const view = (post: Post): Post => {
    const change = topic && post.id ? changes.get(keyOf(topic, post)) : undefined
    if (!change || post.liked === change.liked) return post
    const likes = change.likes ?? Math.max(0, (post.likes ?? 0) + (change.liked ? 1 : -1))
    return { ...post, liked: change.liked, likes }
  }
  // One's own post and an anonymous read carry no liked state; neither can be liked.
  const likeable = (post: Post) => username !== null && post.id !== undefined && post.liked !== undefined && post.author !== username
  const busy = (post: Post) => topic !== null && pending.has(keyOf(topic, post))

  const toggle = async (shown: Post) => {
    if (!topic || !shown.id || !likeable(shown)) return
    const key = keyOf(topic, shown)
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setPending((set) => new Set(set).add(key))
    try {
      const result = LikeResult.parse(await callReader(host, 'like', { topic: topic.id, post: shown.id, liked: !shown.liked }))
      if (result.state === 'failed') onFailure(result.failure.message)
      else setChanges((map) => new Map(map).set(key, { liked: result.liked, likes: result.likes }))
    } catch (error) {
      onFailure(errorMessage(error))
    } finally {
      inFlight.current.delete(key)
      setPending((set) => {
        const next = new Set(set)
        next.delete(key)
        return next
      })
    }
  }
  return { view, likeable, busy, toggle }
}
