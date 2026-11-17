import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { findChannel, parseCommand, type Command } from '../commands'
import { dictionary } from '../dictionary'
import { doublePress } from '../double-press'
import { isWebUrl } from '../forum-html-rules'
import type { PageHost } from '../host'
import { useNow, useReducedMotion } from '../use-environment'
import { useReader } from '../use-reader'
import { useStream } from '../use-stream'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { Conversation, type Notice } from './Conversation'
import { TopicList } from './TopicList'

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function App({ host }: { host: PageHost }) {
  const words = dictionary(host.locale)
  const reduced = useReducedMotion()
  const now = useNow()
  const stream = useStream()
  const streamWanted = useRef(false)
  const reader = useReader(host, (thread) => {
    if (streamWanted.current) stream.start(thread.posts.length)
    else stream.finish()
  })
  streamWanted.current = reader.saved.stream && !reduced
  const [notice, setNotice] = useState<Notice | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const escape = useMemo(() => doublePress(1000), [])
  const thread = reader.thread
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

  const say = (text: string) => setNotice({ kind: 'text', text })

  const jump = (floor: number) => {
    const target = document.getElementById(`floor-${floor}`)
    if (!target) {
      say(words.floorMissing(floor))
      return
    }
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    target.setAttribute('data-flash', '')
    setTimeout(() => target.removeAttribute('data-flash'), 1200)
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

  const run = (command: Command) => {
    if (command.kind !== 'none') setNotice(null)
    switch (command.kind) {
      case 'none':
        return
      case 'next': {
        const result = reader.nextPage()
        if (result === 'closed') say(words.noTopic)
        if (result === 'last') say(words.noMore)
        return
      }
      case 'refresh':
        stream.finish()
        reader.refresh()
        return
      case 'open':
        if (thread) host.open(thread.topic.url)
        else say(words.noTopic)
        return
      case 'leave':
        host.leave()
        return
      case 'help':
        setNotice({ kind: 'help', intro: words.help })
        return
      case 'unknown':
        setNotice({ kind: 'help', intro: words.unknown(command.text) })
        return
      case 'community':
        stream.finish()
        reader.selectCommunity(command.community)
        return
      case 'channel': {
        const channels = reader.community?.channels ?? []
        const channel = findChannel(channels, command.name)
        if (channel) reader.selectChannel(channel.id)
        else say(words.noChannel(command.name, channels.map((one) => `/${one.id}`).join(' ')))
        return
      }
      case 'floor':
        // Floors still streaming in are put out at once, then found.
        stream.finish()
        requestAnimationFrame(() => jump(command.floor))
        return
    }
  }

  // Keys anywhere in the page: any key ends the streaming at once; Esc twice within a second
  // leaves (the boss key); j and k walk the topics while the composer is not being typed in.
  const streamingNow = useRef(streaming)
  streamingNow.current = streaming
  const keys = useRef<(event: KeyboardEvent) => void>(() => {})
  keys.current = (event) => {
    if (streaming && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) stream.finish()
    if (event.key === 'Escape') {
      if (escape()) {
        host.leave()
        return
      }
      if (event.target === input.current) input.current?.blur()
      return
    }
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault()
      stepTopic(event.key === 'j' ? 1 : -1)
    } else if (event.key === '/') {
      // Straight into the composer, the slash and all.
      input.current?.focus()
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
        onCommunity={(id) => run({ kind: 'community', community: id })}
        onChannel={reader.selectChannel}
        onOpen={(one) => openTopic(one)}
      />
      <main className="chat-view">
        <ChatHeader topic={topic} busy={busy} words={words} onRefresh={() => run({ kind: 'refresh' })} onOpen={() => run({ kind: 'open' })} />
        <Conversation
          key={topic ? `${topic.community}:${topic.id}` : 'none'}
          thread={thread}
          notice={notice}
          failure={failure}
          words={words}
          locale={host.locale}
          now={now}
          showImages={reader.saved.images}
          shown={stream.shown}
          onTyped={stream.typed}
          onRetry={reader.retry}
          onLoadMore={() => run({ kind: 'next' })}
          onJump={jump}
        />
        <Composer
          words={words}
          busy={busy && !reduced}
          stream={reader.saved.stream}
          images={reader.saved.images}
          input={input}
          onStream={reader.setStream}
          onImages={reader.setImages}
          onRun={(text) => run(parseCommand(text))}
        />
      </main>
    </div>
  )
}
