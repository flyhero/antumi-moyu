import type { Channel, CommunityId, CommunityInfo, Topic } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import { relativeTime } from '../relative-time'
import { readKey } from '../saved-state'
import type { ListState } from '../use-reader'
import { ChannelPicker } from './ChannelPicker'

// The sidebar, as Antumi's list of conversations: the community and channel on top, then one row a
// topic, its title on one line and what it is under it. The open one floats as a card; one read
// before is quieter.
export function TopicList({ communities, community, channel, list, openTopic, read, words, locale, now, onCommunity, onChannel, onOpen }: {
  communities: CommunityInfo[] | null
  community: CommunityInfo | null
  channel: Channel | null
  list: ListState
  openTopic: Topic | null
  read: Record<string, number>
  words: Words
  locale: PageHost['locale']
  now: number
  onCommunity: (id: CommunityId) => void
  onChannel: (id: string) => void
  onOpen: (topic: Topic) => void
}) {
  const topics = list.topics ?? []
  return (
    <aside className="sidebar">
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
          <ChannelPicker channels={community?.channels ?? []} current={channel} words={words} onPick={onChannel} />
        </div>
      </div>
      <div className="topic-list">
        <ul>
          {topics.map((topic) => {
            const current = openTopic !== null && openTopic.id === topic.id && openTopic.community === topic.community
            const meta = [topic.channel, topic.replies === null ? null : words.replies(topic.replies), topic.time === null ? null : relativeTime(topic.time, now, locale)]
            return (
              <li key={`${topic.community}:${topic.id}`}>
                <button
                  type="button"
                  className="task-row conversation-row"
                  data-topic={`${topic.community}:${topic.id}`}
                  aria-current={current || undefined}
                  data-read={read[readKey(topic.community, topic.id)] !== undefined || undefined}
                  title={topic.title}
                  onClick={() => onOpen(topic)}
                >
                  <span className="conversation-status" data-glyph="idle" aria-hidden="true" />
                  <span className="task-row-title">{topic.title}</span>
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
    </aside>
  )
}
