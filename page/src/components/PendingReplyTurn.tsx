import type { CommunityId } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { absoluteTime, relativeTime } from '../relative-time'
import type { PendingReply } from '../use-reply'
import { Avatar } from './Avatar'
import { ReplyIcon } from './icons'

// A confirmed submission, before the community gives it a public floor. Render the original
// text as text: the queue response does not include the forum's cooked HTML.
export function PendingReplyTurn({ reply, community, disguiseAvatars, words, locale, now }: {
  reply: PendingReply
  community: CommunityId
  disguiseAvatars: boolean
  words: Words
  locale: PageHost['locale']
  now: number
}) {
  return (
    <div className="chat-entry chat-pending-reply">
      <div className="chat-turn-head">
        <Avatar src={null} name={reply.author} community={community} disguise={disguiseAvatars} />
        <span className="chat-turn-head-name">{reply.author}</span>
        <span className="chat-pending-badge" role="status">{words.replyPending}</span>
        <span className="chat-message-time" title={absoluteTime(reply.time)}>{relativeTime(reply.time, now, locale)}</span>
      </div>
      <div className="chat-assistant">
        {reply.target && <span className="chat-reply-chip"><ReplyIcon /><span>{words.replyToComment(reply.target.floor, reply.target.author)}</span></span>}
        <div className="chat-pending-text">{reply.text}</div>
      </div>
    </div>
  )
}
