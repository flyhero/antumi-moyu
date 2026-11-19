import type { ComponentChildren } from 'preact'
import type { Topic } from '../../../src/community'
import type { Words } from '../dictionary'
import { ExternalIcon, LeaveIcon, RefreshIcon } from './icons'
import { FloorJump } from './FloorJump'

// The conversation's header: its status mark, the topic's title, then who and where in muted text,
// and the reading tools on the right.
export function ChatHeader({ topic, busy, words, onRefresh, onOpen, onJump, onLeave, notifications }: {
  topic: Topic | null
  busy: boolean
  words: Words
  onRefresh: () => void
  onOpen: () => void
  onJump: (floor: number) => void
  onLeave: () => void
  notifications: ComponentChildren
}) {
  return (
    <header className="chat-header">
      {busy ? <span className="chat-spinner" aria-hidden="true" /> : <span className="conversation-status" data-glyph="idle" aria-hidden="true" />}
      <div className="header-meta">
        <span className="conversation-title" title={topic?.title}>{topic?.title ?? words.newChat}</span>
        {topic && <span className="muted">{topic.author}</span>}
        {topic?.channel && <span className="muted">{topic.channel}</span>}
        {topic && topic.replies !== null && <span className="muted">{words.replies(topic.replies)}</span>}
      </div>
      <div className="toolbar">
        {notifications}
        {topic && <FloorJump key={`${topic.community}:${topic.id}`} words={words} onJump={onJump} />}
        <button type="button" className="tool-button" aria-label={words.refresh} title={words.refresh} onClick={onRefresh}><RefreshIcon /></button>
        <button type="button" className="tool-button" aria-label={words.openInBrowser} title={words.openInBrowser} disabled={!topic} onClick={onOpen}><ExternalIcon /></button>
        <button type="button" className="tool-button" aria-label={words.leave} title={words.leave} onClick={onLeave}><LeaveIcon /></button>
      </div>
    </header>
  )
}
