import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { CommunityId, Post } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { absoluteTime, relativeTime } from '../relative-time'
import { ForumHtml } from './ForumHtml'
import { LikeButton } from './LikeButton'

// What the author wrote, as the user's own message: a bubble on the right. A long one is held to
// about twelve lines, fading out, until opened.
export function OpeningMessage({ post, page, community, words, locale, now, showImages, canLike, liking, onLike }: {
  post: Post
  page: number
  community: CommunityId
  words: Words
  locale: PageHost['locale']
  now: number
  showImages: boolean
  canLike: boolean
  liking: boolean
  onLike: (post: Post) => void
}) {
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  const bubble = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = bubble.current
    if (!element || open) return
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 2)
    measure()
    // Pictures opened in place, or loading late, change how tall it is.
    const observer = new ResizeObserver(measure)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => observer.disconnect()
  }, [post.html, showImages, open])

  return (
    <div className="chat-entry" data-user="" id={`floor-${post.floor}`} data-reading-floor={post.floor} data-reading-page={page}>
      <div ref={bubble} className="chat-user" data-clamped={!open || undefined} data-clipped={(long && !open) || undefined}>
        <ForumHtml className="chat-user-text" html={post.html} showImages={showImages} words={words} />
      </div>
      {long && (
        <div className="chat-user-more">
          <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? words.collapse : words.expand}
          </button>
        </div>
      )}
      <div className="chat-user-footer">
        <LikeButton post={post} community={community} words={words} canLike={canLike} liking={liking} onLike={onLike} />
        {post.time !== null && <span className="chat-message-time" title={absoluteTime(post.time)}>{relativeTime(post.time, now, locale)}</span>}
      </div>
    </div>
  )
}
