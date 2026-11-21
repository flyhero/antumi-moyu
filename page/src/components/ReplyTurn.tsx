import { useEffect, useState } from 'preact/hooks'
import type { CommunityId, Post } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { absoluteTime, relativeTime } from '../relative-time'
import { Avatar } from './Avatar'
import { ForumHtml } from './ForumHtml'
import { HeartIcon, ReplyIcon } from './icons'

// A reply, drawn as an agent's turn: who answers where the agent's name goes, the floor where the
// model goes, then the reply with no bubble, and a quiet footer.
export function ReplyTurn({ post, page, community, disguiseAvatars, words, locale, now, showImages, typing, onTyped, replyName, onJump, canReply, onReply, canLike, liking, onLike }: {
  post: Post
  page: number
  community: CommunityId
  disguiseAvatars: boolean
  words: Words
  locale: PageHost['locale']
  now: number
  showImages: boolean
  typing: boolean
  onTyped: () => void
  // The author of the floor it answers, when that floor is loaded.
  replyName: string | undefined
  onJump: (floor: number) => void
  canReply: boolean
  onReply: (post: Post) => void
  canLike: boolean
  liking: boolean
  onLike: (post: Post) => void
}) {
  const replyTo = post.replyTo
  const likes = post.likes ?? 0
  const liked = post.liked === true
  // V2EX's thanks cost coins and stay sent, so the first click only asks.
  const thanks = community === 'v2ex'
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(false), 3000)
    return () => clearTimeout(timer)
  }, [asking])
  const settled = thanks && liked
  const likeTitle = !canLike ? (likes > 0 ? words.likes(likes) : words.loginToLike)
    : settled ? words.thanked : asking ? words.confirmThank
    : liked ? words.unlike : thanks ? words.thank(post.floor, post.author) : words.like(post.floor, post.author)
  const like = () => {
    if (thanks && !asking) { setAsking(true); return }
    setAsking(false)
    onLike(post)
  }
  return (
    <div className="chat-entry" id={`floor-${post.floor}`} data-reading-floor={post.floor} data-reading-page={page}>
      <div className="chat-turn-head">
        <Avatar src={post.avatar} name={post.author} community={community} disguise={disguiseAvatars} />
        <span className="chat-turn-head-name">{post.author}</span>
        {post.byAuthor && <span className="chat-turn-op" title={words.topicAuthorHint}>OP</span>}
        <span className="chat-turn-head-model">#{post.floor}</span>
        {post.time !== null && <span className="chat-message-time" title={absoluteTime(post.time)}>{relativeTime(post.time, now, locale)}</span>}
      </div>
      <div className="chat-assistant" data-streaming={typing || undefined}>
        {replyTo !== null && (
          <button
            type="button"
            className="chat-reply-chip"
            disabled={replyName === undefined}
            title={replyName === undefined ? words.notLoaded : undefined}
            onClick={() => onJump(replyTo)}
          >
            <ReplyIcon />
            <span>{words.replyTo(replyTo, replyName ?? null)}</span>
          </button>
        )}
        <ForumHtml className="chat-markdown" html={post.html} showImages={showImages} words={words} typing={typing} onTyped={onTyped} />
        {!typing && (
          <div className="chat-message-actions chat-turn-actions">
            {(canLike || likes > 0) && (
              <button type="button" className="chat-turn-like" data-liked={liked || undefined} data-asking={asking || undefined}
                aria-pressed={liked} disabled={!canLike || liking || settled} title={likeTitle} aria-label={likeTitle} onClick={like}>
                <HeartIcon filled={liked} />
                {asking ? <span>{words.confirmThank}</span> : likes > 0 && <span>{likes}</span>}
              </button>
            )}
            <button type="button" className="chat-comment-reply" disabled={!canReply}
              title={canReply ? words.replyToComment(post.floor, post.author) : words.loginToReply}
              aria-label={words.replyToComment(post.floor, post.author)} onClick={() => onReply(post)}>
              <ReplyIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
