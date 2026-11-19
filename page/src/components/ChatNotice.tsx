import type { Words } from '../dictionary'
import { SparkIcon } from './icons'

// A line in the chat about the chat itself: muted, with a way to try again when something failed.
// The failure is shown as the backend worded it.
export function ChatNotice({ text, words, onRetry }: { text: string; words: Words; onRetry?: () => void }) {
  if (!onRetry) return <div className="chat-notice" role="status">{text}</div>
  return (
    <div className="chat-notice chat-notice-actionable" role="alert">
      <span>{text}</span>
      <button type="button" className="button chat-notice-action" onClick={onRetry}>{words.retry}</button>
    </div>
  )
}

// The reading introduction, drawn as an assistant turn.
export function AssistantNotice({ intro, words }: { intro: string; words: Words }) {
  return (
    <div className="chat-entry" data-notice="">
      <div className="chat-turn-head">
        <span className="chat-turn-head-icon" aria-hidden="true"><SparkIcon /></span>
        <span className="chat-turn-head-name">{words.assistant}</span>
      </div>
      <div className="chat-assistant">
        <div className="chat-markdown">
          <p>{intro}</p>
        </div>
      </div>
    </div>
  )
}
