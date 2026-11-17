import { Fragment } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import type { ThreadState } from '../use-reader'
import { AssistantNotice, ChatNotice } from './ChatNotice'
import { OpeningMessage } from './OpeningMessage'
import { ReplyTurn } from './ReplyTurn'
import { WorkingLine } from './WorkingLine'

// Something the reader says in the chat: the command list, or a plain line.
export type Notice = { kind: 'help'; intro: string } | { kind: 'text'; text: string }

// The thread as a conversation: the opening post as the user's message, each reply as a turn.
export function Conversation({ thread, notice, failure, words, locale, now, showImages, shown, onTyped, onRetry, onLoadMore, onJump }: {
  thread: ThreadState | null
  notice: Notice | null
  // What failed outside the thread (the communities, the list).
  failure: string | null
  words: Words
  locale: PageHost['locale']
  now: number
  showImages: boolean
  // How many of the first page's replies are out while they stream; null when all are.
  shown: number | null
  onTyped: (index: number, total: number) => void
  onRetry: () => void
  onLoadMore: () => void
  onJump: (floor: number) => void
}) {
  const said = useRef<HTMLDivElement>(null)
  useEffect(() => {
    said.current?.scrollIntoView({ block: 'nearest' })
  }, [notice])

  const pages = thread?.pages ?? []
  const last = pages.at(-1)
  const authors = new Map<number, string>()
  for (const page of pages) {
    if (page.opening) authors.set(page.opening.floor, page.opening.author)
    for (const post of page.posts) authors.set(post.floor, post.author)
  }
  const streaming = shown !== null

  return (
    <div className="chat-list">
      {!thread && <AssistantNotice intro={words.help} words={words} />}
      {pages.map((page, pageIndex) => {
        const posts = pageIndex === 0 && shown !== null ? page.posts.slice(0, shown) : page.posts
        return (
          <Fragment key={page.page}>
            {page.page > 1 && <div className="chat-divider">{words.page(page.page)}</div>}
            {page.opening && <OpeningMessage post={page.opening} words={words} locale={locale} now={now} showImages={showImages} />}
            {posts.map((post, index) => (
              <ReplyTurn
                key={post.floor}
                post={post}
                words={words}
                locale={locale}
                now={now}
                showImages={showImages}
                typing={pageIndex === 0 && shown !== null && index === shown - 1}
                onTyped={() => onTyped(index, page.posts.length)}
                replyName={post.replyTo === null ? undefined : authors.get(post.replyTo)}
                onJump={onJump}
              />
            ))}
          </Fragment>
        )
      })}
      {thread && thread.loading !== null && <WorkingLine phase="thinking" words={words} />}
      {streaming && <WorkingLine phase="replying" words={words} />}
      {thread?.error && <ChatNotice text={thread.error.message} words={words} onRetry={onRetry} />}
      {failure !== null && <ChatNotice text={failure} words={words} onRetry={onRetry} />}
      {!streaming && thread && thread.loading === null && !thread.error && last?.more && (
        <button type="button" className="button chat-more" onClick={onLoadMore}>{words.loadMore}</button>
      )}
      {notice && (
        <div ref={said} className="chat-said">
          {notice.kind === 'help' ? <AssistantNotice intro={notice.intro} words={words} /> : <ChatNotice text={notice.text} words={words} />}
        </div>
      )}
    </div>
  )
}
