import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Post } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { absoluteTime, relativeTime } from '../relative-time'
import { ForumHtml } from './ForumHtml'

// What the author wrote, as the user's own message: a bubble on the right. A long one is held to
// about twelve lines, fading out, until opened.
export function OpeningMessage({ post, words, locale, now, showImages }: {
  post: Post
  words: Words
  locale: PageHost['locale']
  now: number
  showImages: boolean
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
    <div className="chat-entry" data-user="" id={`floor-${post.floor}`}>
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
      {post.time !== null && (
        <div className="chat-user-footer">
          <span className="chat-message-time" title={absoluteTime(post.time)}>{relativeTime(post.time, now, locale)}</span>
        </div>
      )}
    </div>
  )
}
