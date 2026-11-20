import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Channel, CommunityId, CommunityInfo, Topic } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { clampListWidth, LIST_WIDTH_DEFAULT, LIST_WIDTH_MIN, LIST_WIDTH_STEP, listWidthLimit } from '../list-width'
import { relativeTime } from '../relative-time'
import { readKey } from '../saved-state'
import { coverFor, type TitleCover } from '../title-disguise'
import type { ListState } from '../use-reader'
import { ChannelPicker } from './ChannelPicker'
import { RefreshIcon } from './icons'

// The sidebar, as Antumi's list of conversations: the community and channel on top, then one row a
// topic, its title on one line and what it is under it. The open one floats as a card; one read
// before is quieter.
export function TopicList({ communities, community, channel, list, openTopic, read, words, locale, now, listWidth, disguiseTitles, titleCovers, onListWidth, onCommunity, onChannel, onOpen, onRefresh }: {
  communities: CommunityInfo[] | null
  community: CommunityInfo | null
  channel: Channel | null
  list: ListState
  openTopic: Topic | null
  read: Record<string, number>
  words: Words
  locale: PageHost['locale']
  now: number
  listWidth: number
  disguiseTitles: boolean
  titleCovers: readonly TitleCover[]
  onListWidth: (width: number) => void
  onCommunity: (id: CommunityId) => void
  onChannel: (id: string) => void
  onOpen: (topic: Topic) => void
  onRefresh: () => void
}) {
  const topics = list.topics ?? []
  return (
    <ListFrame saved={listWidth} words={words} onWidth={onListWidth}>
      <div className="sidebar-head">
        {/* One forum alone has nothing to switch to. */}
        {communities && communities.length > 1 && (
          <div className="segmented" role="radiogroup">
            {communities.map((one) => (
              <button key={one.id} type="button" role="radio" aria-checked={one.id === community?.id} onClick={() => onCommunity(one.id)}>{one.name}</button>
            ))}
          </div>
        )}
        <div className="sidebar-section">
          <span className="sidebar-section-label">{words.conversations}</span>
          {list.topics && <span className="count">{topics.length}</span>}
          <button
            type="button"
            className="tool-button list-refresh"
            aria-label={list.loading ? words.refreshingList : words.refreshList}
            title={list.loading ? words.refreshingList : words.refreshList}
            aria-busy={list.loading}
            disabled={list.loading || !channel}
            onClick={onRefresh}
          ><RefreshIcon /></button>
          <ChannelPicker channels={community?.channels ?? []} current={channel} words={words} onPick={onChannel} />
        </div>
      </div>
      <div className="topic-list">
        <ul>
          {topics.map((topic) => {
            const current = openTopic !== null && openTopic.id === topic.id && openTopic.community === topic.community
            const meta = [topic.channel, topic.replies === null ? null : words.replies(topic.replies), topic.time === null ? null : relativeTime(topic.time, now, locale)]
            const cover = disguiseTitles ? coverFor(readKey(topic.community, topic.id), titleCovers) : null
            return (
              <li key={`${topic.community}:${topic.id}`}>
                <button
                  type="button"
                  className="task-row conversation-row"
                  data-topic={`${topic.community}:${topic.id}`}
                  aria-current={current || undefined}
                  data-read={read[readKey(topic.community, topic.id)] !== undefined || undefined}
                  data-title-cover={cover !== null || undefined}
                  aria-label={cover !== null ? topic.title : undefined}
                  title={topic.title}
                  onClick={() => onOpen(topic)}
                >
                  <span className="conversation-status" data-glyph="idle" aria-hidden="true" />
                  <span className="task-row-title">
                    {cover !== null && <span className="title-cover">{cover}</span>}
                    <span className="title-real">{topic.title}</span>
                  </span>
                  <span className="task-row-meta">{meta.filter((part) => part !== null).join(' · ')}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {list.loading && !list.topics && <p className="topic-list-note">{words.loading}</p>}
        {list.error !== null && !list.topics && <p className="topic-list-note">{words.listFailed}</p>}
        {list.topics && topics.length === 0 && <p className="topic-list-note">{words.empty}</p>}
      </div>
    </ListFrame>
  )
}

// The list's right edge, dragged between the limits in list-width.ts. A double-click puts it back.
function ListFrame({ saved, words, onWidth, children }: { saved: number, words: Words, onWidth: (width: number) => void, children: ComponentChildren }) {
  const aside = useRef<HTMLElement>(null)
  const drag = useRef<number | null>(null)
  const grab = useRef(0)
  const [pane, setPane] = useState(() => window.innerWidth)
  const [dragged, setDragged] = useState<number | null>(null)
  const shown = clampListWidth(dragged ?? saved, pane)
  const limit = listWidthLimit(pane)
  useEffect(() => {
    const resize = () => setPane(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const remember = (next: number) => {
    drag.current = next
    setDragged(next)
  }
  const commit = () => {
    if (drag.current !== null) onWidth(drag.current)
    drag.current = null
    setDragged(null)
    document.body.removeAttribute('data-resizing-list')
  }
  const offset = (clientX: number) => clientX - (aside.current?.getBoundingClientRect().left ?? 0)
  return (
    <aside ref={aside} className="sidebar" style={{ width: shown }}>
      {children}
      <div
        className="sidebar-resizer"
        data-dragging={dragged !== null}
        role="separator"
        aria-label={words.resizeList}
        aria-orientation="vertical"
        aria-valuemin={LIST_WIDTH_MIN}
        aria-valuemax={limit}
        aria-valuenow={shown}
        aria-valuetext={words.listWidthPixels(shown)}
        title={words.resetListWidth}
        tabIndex={0}
        onKeyDown={(event) => {
          const next = event.key === 'ArrowLeft' ? shown - LIST_WIDTH_STEP
            : event.key === 'ArrowRight' ? shown + LIST_WIDTH_STEP
            : event.key === 'Home' ? LIST_WIDTH_MIN
            : event.key === 'End' ? limit
            : null
          if (next === null) return
          event.preventDefault()
          onWidth(clampListWidth(next, window.innerWidth))
        }}
        onDblClick={() => onWidth(LIST_WIDTH_DEFAULT)}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          grab.current = offset(event.clientX) - shown
          remember(shown)
          document.body.dataset.resizingList = ''
        }}
        onPointerMove={(event) => {
          if (drag.current === null) return
          remember(clampListWidth(offset(event.clientX) - grab.current, window.innerWidth))
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onLostPointerCapture={commit}
      />
    </aside>
  )
}
