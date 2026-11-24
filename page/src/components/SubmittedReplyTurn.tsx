import type { CommunityId } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { absoluteTime, relativeTime } from '../relative-time'
import type { SubmittedReply } from '../submitted-reply'
import { Avatar } from './Avatar'
import { ForumHtml } from './ForumHtml'
import { ReplyIcon } from './icons'

// A confirmed submission shown without fetching the thread again. Use cooked HTML when the
// send response has it; otherwise show the original text safely until a later thread read.
export function SubmittedReplyTurn({ reply, community, disguiseAvatars, words, locale, now, showImages }: {
  reply: SubmittedReply
  community: CommunityId
  disguiseAvatars: boolean
  words: Words
  locale: PageHost['locale']
  now: number
  showImages: boolean
}) {
  const pending = reply.result.state === 'pending'
  const post = reply.result.state === 'sent' ? reply.result.post : undefined
  const floor = reply.result.state === 'sent' ? post?.floor ?? reply.result.location?.floor : undefined
  const author = post?.author || reply.author
  const time = post?.time ?? reply.time
  return (
    <div className={`chat-entry chat-submitted-reply ${pending ? 'chat-pending-reply' : 'chat-sent-reply'}`} id={floor !== undefined ? `floor-${floor}` : undefined}>
      <div className="chat-turn-head">
        <Avatar src={post?.avatar ?? null} name={author} community={community} disguise={disguiseAvatars} />
        <span className="chat-turn-head-name">{author}</span>
        {floor !== undefined && <span className="chat-turn-head-model">#{floor}</span>}
        <span className={pending ? 'chat-pending-badge' : 'chat-sent-status'} role="status">{pending ? words.replyPending : words.replySent}</span>
        <span className="chat-message-time" title={absoluteTime(time)}>{relativeTime(time, now, locale)}</span>
      </div>
      <div className="chat-assistant">
        {reply.target && <span className="chat-reply-chip"><ReplyIcon /><span>{words.replyToComment(reply.target.floor, reply.target.author)}</span></span>}
        {post ? <ForumHtml className="chat-markdown" html={post.html} showImages={showImages} words={words} />
          : <div className="chat-pending-text">{reply.text}</div>}
      </div>
    </div>
  )
}
