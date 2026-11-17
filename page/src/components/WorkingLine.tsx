import { useEffect, useState } from 'preact/hooks'
import type { Words } from '../dictionary'
import { ReplyingIcon, ThinkingIcon } from './icons'

// The chat's working line at the end of the conversation: the assistant thinks while a page loads
// and writes while replies stream in, with a clock that ticks for the eye only.
export function WorkingLine({ phase, words }: { phase: 'thinking' | 'replying'; words: Words }) {
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(started)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="chat-working" role="status">
      <span className="chat-working-icon" data-phase={phase} aria-hidden="true">{phase === 'thinking' ? <ThinkingIcon /> : <ReplyingIcon />}</span>
      <span className="chat-working-part" aria-hidden="true">{Math.floor((now - started) / 1000)}s</span>
      <span className="chat-working-part">
        <span className="chat-working-dot" aria-hidden="true">·</span>
        <span className="chat-sheen chat-working-sheen">{phase === 'thinking' ? words.thinking : words.replying}</span>
      </span>
    </div>
  )
}
