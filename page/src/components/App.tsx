import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useNotifications } from '../use-notifications'
import { NotificationsMenu } from './NotificationsMenu'
import { dictionary } from '../dictionary'
import { doublePress } from '../double-press'
import { isWebUrl } from '../forum-html-rules'
import type { PageHost } from '../host'
import { useNow, useReducedMotion } from '../use-environment'
import { useReader } from '../use-reader'
import { useStream } from '../use-stream'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { Conversation } from './Conversation'
import { TopicList } from './TopicList'
import { SessionBar } from './SessionBar'
import { useForumSession } from '../use-forum-session'
import { usePageState } from '../use-page-state'
import { useReply } from '../use-reply'

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function App({ host }: { host: PageHost }) {
  const words = dictionary(host.locale)
  const reduced = useReducedMotion()
  const now = useNow()
  const stream = useStream()
  const streamWanted = useRef(false)
  const session = useForumSession(host)
  const store = usePageState(host)
  const reader = useReader(host, store, (thread, restoring) => {
    if (!restoring && streamWanted.current) stream.start(thread.posts.length)
    else stream.finish()
  }, session.account?.username ?? null)
  streamWanted.current = reader.saved.stream && !reduced
  const [notice, setNotice] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const escape = useMemo(() => doublePress(1000), [])
  const thread = reader.thread
  const reply = useReply(host, thread?.topic ?? null, session.account?.username ?? null, store, (topic, result) => {
    stream.finish()
    if (result.state === 'sent') reader.showSent(topic, result.location)
    reader.refreshList()
  })
  const notifications = useNotifications(host, reader.community?.id ?? null, session.account)
  const streaming = stream.shown !== null

  // The app's look: the tokens are on :root already; the scheme decides the browser's own parts.
  useEffect(() => {
    const root = document.documentElement
    root.lang = host.locale
    root.dataset.scheme = host.theme.scheme
    return host.onTheme((theme) => {
      root.dataset.scheme = theme.scheme
    })
  }, [host])

  // No link moves the frame: each opens in the browser, through the host.
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a')
      if (!link) return
      event.preventDefault()
      if (target.closest('[data-image-chip]')) return
      const href = link.getAttribute('href')
      if (event.type === 'click' && href && isWebUrl(href)) host.open(href)
    }
    document.addEventListener('click', click, true)
    document.addEventListener('auxclick', click, true)
    return () => {
      document.removeEventListener('click', click, true)
      document.removeEventListener('auxclick', click, true)
    }
  }, [host])

  const openTopic: typeof reader.openTopic = (topic, force) => {
    setNotice(null)
    stream.finish()
    reader.openTopic(topic, force)
  }

  const say = (text: string) => setNotice(text)

  const jump = (floor: number) => {
    setNotice(null)
    stream.finish()
    requestAnimationFrame(() => {
      const target = document.getElementById(`floor-${floor}`)
      if (!target) {
        say(words.floorMissing(floor))
        return
      }
      target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
      target.setAttribute('data-flash', '')
      setTimeout(() => target.removeAttribute('data-flash'), 1200)
    })
  }

  const stepTopic = (delta: number) => {
    const topics = reader.list.topics ?? []
    if (topics.length === 0) return
    const at = thread ? topics.findIndex((topic) => topic.id === thread.topic.id && topic.community === thread.topic.community) : -1
    const next = at === -1 ? (delta > 0 ? 0 : topics.length - 1) : at + delta
    const topic = topics[next]
    if (!topic) return
    openTopic(topic)
    document.querySelector(`[data-topic="${topic.community}:${topic.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  const nextPage = () => {
    setNotice(null)
    const result = reader.nextPage()
    if (result === 'closed') say(words.noTopic)
    if (result === 'last') say(words.noMore)
  }
  const refresh = () => {
    setNotice(null)
    stream.finish()
    reader.refresh()
  }
  const openInBrowser = () => {
    if (thread) host.open(thread.topic.url)
    else say(words.noTopic)
  }

  // Keys anywhere in the page: any key ends the streaming at once; Esc twice within a second
  // leaves (the boss key); j and k walk the topics while the composer is not being typed in.
  const streamingNow = useRef(streaming)
  streamingNow.current = streaming
  const keys = useRef<(event: KeyboardEvent) => void>(() => {})
  keys.current = (event) => {
    if (event.isComposing) return
    if (streaming && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) stream.finish()
    if (event.key === 'Escape') {
      if (escape()) {
        host.leave()
        return
      }
      if (event.target === input.current) input.current?.blur()
      return
    }
    if (event.target instanceof Element && event.target.closest('[data-notifications-panel]')) return
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault()
      stepTopic(event.key === 'j' ? 1 : -1)
    } else if (['n', 'r', 'o', 'q'].includes(event.key)) {
      event.preventDefault()
      if (event.key === 'n') nextPage()
      if (event.key === 'r') refresh()
      if (event.key === 'o') openInBrowser()
      if (event.key === 'q') host.leave()
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => keys.current(event)
    const pointer = () => {
      if (streamingNow.current) stream.finish()
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', pointer)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', pointer)
    }
  }, [])
  const failure = reader.communitiesError ?? reader.list.error
  const topic = thread?.topic ?? null
  const busy = (thread?.loading ?? null) !== null || streaming

  return (
    <div className="app">
      <TopicList
        communities={reader.communities}
        community={reader.community}
        channel={reader.channel}
        list={reader.list}
        openTopic={topic}
        read={reader.saved.read}
        words={words}
        locale={host.locale}
        now={now}
        onCommunity={(id) => { setNotice(null); stream.finish(); reader.selectCommunity(id) }}
        onChannel={reader.selectChannel}
        onOpen={(one) => openTopic(one)}
        onRefresh={reader.refreshList}
        listWidth={store.state.listWidth}
        onListWidth={(width) => store.update((state) => state.listWidth === width ? state : { ...state, listWidth: width })}
      />
      <main className="chat-view">
        <ChatHeader topic={topic} busy={busy} words={words} onRefresh={refresh} onOpen={openInBrowser} onJump={jump} onLeave={() => host.leave()}
          notifications={<NotificationsMenu inbox={notifications} words={words} locale={host.locale} now={now} onSelect={(item) => {
            setNotice(null)
            stream.finish()
            if (item.target) reader.openAt(item.target.topic, item.target)
            else host.open(item.url)
          }} />} />
        <SessionBar session={session} words={words} />
        <Conversation
          key={topic ? `${topic.community}:${topic.id}` : 'none'}
          thread={thread}
          notice={notice}
          failure={failure}
          words={words}
          locale={host.locale}
          now={now}
          showImages={reader.saved.images}
          disguiseAvatars={reader.saved.disguiseAvatars}
          shown={stream.shown}
          onTyped={stream.typed}
          onRetry={reader.retry}
          onLoadMore={nextPage}
          onLoadPrevious={reader.previousPage}
          positionKey={reader.positionKey}
          onPosition={reader.rememberPosition}
          onJump={jump}
          canReply={session.account !== null && !reply.sending}
          onReply={(post) => {
            if (!session.account || reply.sending) return
            reply.setTarget({ floor: post.floor, author: post.author })
            stream.finish()
            input.current?.focus()
          }}
        />
        <Composer
          words={words}
          stream={reader.saved.stream}
          images={reader.saved.images}
          disguiseAvatars={reader.saved.disguiseAvatars}
          input={input}
          onStream={reader.setStream}
          onImages={reader.setImages}
          onDisguiseAvatars={reader.setDisguiseAvatars}
          reply={reply}
          storageError={store.storageError}
          onLogin={() => void session.login()}
          loginBusy={session.busy}
          onViewPost={openInBrowser}
          canReply={session.account !== null && topic !== null}
        />
      </main>
    </div>
  )
}
