import { Fragment } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { ReadingPosition } from '../saved-state'
import { useReadingPosition } from '../use-reading-position'
import type { Post } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import type { ThreadState } from '../use-reader'
import { receivedReply, type SubmittedReply } from '../submitted-reply'
import { AssistantNotice, ChatNotice } from './ChatNotice'
import { ChevronDownIcon } from './icons'
import { OpeningMessage } from './OpeningMessage'
import { SubmittedReplyTurn } from './SubmittedReplyTurn'
import { ReplyTurn } from './ReplyTurn'
import { WorkingLine } from './WorkingLine'

// The thread as a conversation: the opening post as the user's message, each reply as a turn.
export function Conversation({ thread, paused, submittedReplies, notice, failure, words, locale, now, showImages, disguiseAvatars, shown, onTyped, onRetry, onLoadMore, onJump, canReply, onReply, likes, onLoadPrevious, positionKey, onPosition }: {
  thread: ThreadState | null
  paused: boolean
  submittedReplies: readonly SubmittedReply[]
  notice: string | null
  // What failed outside the thread (the communities, the list).
  failure: string | null
  words: Words
  locale: PageHost['locale']
  now: number
  showImages: boolean
  disguiseAvatars: boolean
  // How many of the first page's replies are out while they stream; null when all are.
  shown: number | null
  onTyped: (index: number, total: number) => void
  onRetry: () => void
  onLoadMore: () => void
  onLoadPrevious: () => void
  positionKey: string | null
  onPosition: (key: string, position: ReadingPosition) => void
  onJump: (floor: number) => void
  canReply: boolean
  onReply: (post: Post) => void
  likes: { view: (post: Post, opening?: boolean) => Post; likeable: (post: Post) => boolean; busy: (post: Post, opening?: boolean) => boolean; toggle: (post: Post, opening?: boolean) => void }
}) {
  const list = useReadingPosition(positionKey, thread, shown !== null, onPosition)
  const said = useRef<HTMLDivElement>(null)
  const submitted = useRef<HTMLDivElement>(null)
  const pages = thread?.pages ?? []
  const received = pages.flatMap((page) => page.posts)
  const local = submittedReplies.filter((reply) => !received.some((post) => receivedReply(reply, post)))
  const latest = local.at(-1)?.id
  const scrolled = useRef(0)
  useEffect(() => {
    if (latest === undefined || latest <= scrolled.current) return
    scrolled.current = latest
    submitted.current?.lastElementChild?.scrollIntoView({ block: 'start' })
  }, [latest])
  useEffect(() => {
    said.current?.scrollIntoView({ block: 'nearest' })
  }, [notice])

  const last = pages.at(-1)
  const authors = new Map<number, string>()
  for (const page of pages) {
    if (page.opening) authors.set(page.opening.floor, page.opening.author)
    for (const post of page.posts) authors.set(post.floor, post.author)
  }
  const streaming = shown !== null

  return (
    <div ref={list} className="chat-list" data-restoring={thread?.focus ? true : undefined}>
      {!thread && <AssistantNotice intro={words.readingIntro} words={words} />}
      {pages[0] && pages[0].page > 1 && (
        <div className="chat-more-row">
          <button type="button" className="chat-more" data-up="" disabled={thread?.loading !== null} onClick={onLoadPrevious}><ChevronDownIcon />{words.loadPrevious}</button>
        </div>
      )}
      {pages.map((page, pageIndex) => {
        const posts = pageIndex === 0 && shown !== null ? page.posts.slice(0, shown) : page.posts
        return (
          <Fragment key={page.page}>
            {page.page > 1 && <div className="chat-divider">{words.page(page.page)}</div>}
            {page.opening && (
              <OpeningMessage post={likes.view(page.opening, true)} page={page.page} community={page.topic.community} words={words} locale={locale} now={now} showImages={showImages}
                canLike={likes.likeable(page.opening)} liking={likes.busy(page.opening, true)} onLike={(post) => likes.toggle(post, true)} />
            )}
            {posts.map((post, index) => (
              <ReplyTurn
                key={post.floor}
                post={likes.view(post)}
                page={page.page}
                community={page.topic.community}
                disguiseAvatars={disguiseAvatars}
                words={words}
                locale={locale}
                now={now}
                showImages={showImages}
                typing={pageIndex === 0 && shown !== null && index === shown - 1}
                onTyped={() => onTyped(index, page.posts.length)}
                replyName={post.replyTo === null ? undefined : authors.get(post.replyTo)}
                onJump={onJump}
                canReply={canReply}
                onReply={onReply}
                canLike={likes.likeable(post)}
                liking={likes.busy(post)}
                onLike={(post) => likes.toggle(post)}
              />
            ))}
          </Fragment>
        )
      })}
      {thread && thread.loading !== null && <WorkingLine phase="thinking" words={words} />}
      {streaming && <WorkingLine phase="replying" words={words} />}
      {!paused && thread?.error && <ChatNotice text={thread.error.message} words={words} onRetry={onRetry} />}
      {!paused && failure !== null && <ChatNotice text={failure} words={words} onRetry={onRetry} />}
      {!streaming && thread && thread.loading === null && !thread.error && last?.more && (
        <div className="chat-more-row">
          <button type="button" className="chat-more" onClick={onLoadMore}><ChevronDownIcon />{words.loadMore}</button>
        </div>
      )}
      {thread && local.length > 0 && <div ref={submitted} className="chat-submitted-replies">
        {local.map((reply) => <SubmittedReplyTurn key={reply.id} reply={reply} community={thread.topic.community}
          disguiseAvatars={disguiseAvatars} words={words} locale={locale} now={now} showImages={showImages} />)}
      </div>}
      {notice && (
        <div ref={said} className="chat-said">
          <ChatNotice text={notice} words={words} />
        </div>
      )}
    </div>
  )
}
