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

// The command list, said by the assistant as a reply of its own.
export function AssistantNotice({ intro, commands, words }: { intro: string; commands: Array<[string, string]>; words: Words }) {
  return (
    <div className="chat-entry" data-notice="">
      <div className="chat-turn-head">
        <span className="chat-turn-head-icon" aria-hidden="true"><SparkIcon /></span>
        <span className="chat-turn-head-name">{words.assistant}</span>
      </div>
      <div className="chat-assistant">
        <div className="chat-markdown">
          <p>{intro}</p>
          <table>
            <thead><tr>{words.commandsTitle.map((title) => <th key={title}>{title}</th>)}</tr></thead>
            <tbody>
              {commands.map(([command, meaning]) => (
                <tr key={command}><td><code>{command}</code></td><td>{meaning}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
