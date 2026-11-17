import type { Ref } from 'preact'
import { useState } from 'preact/hooks'
import type { Words } from '../dictionary'
import { EnterIcon } from './icons'

// The composer, as a command line: Enter runs what is typed and clears it; nothing is ever sent.
// Under the text, where the agent and model pickers sit, the page's two settings.
export function Composer({ words, busy, stream, images, input, onStream, onImages, onRun }: {
  words: Words
  busy: boolean
  stream: boolean
  images: boolean
  input: Ref<HTMLTextAreaElement>
  onStream: (stream: boolean) => void
  onImages: (images: boolean) => void
  onRun: (text: string) => void
}) {
  const [text, setText] = useState('')
  const run = () => {
    onRun(text)
    setText('')
  }
  return (
    <div className="chat-dock">
      <div className="chat-input-card" data-working={busy || undefined}>
        <textarea
          ref={input}
          className="chat-input"
          rows={1}
          spellcheck={false}
          autocomplete="off"
          aria-label={words.placeholder}
          placeholder={words.placeholder}
          value={text}
          onInput={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter while an input method composes picks a word; it does not run.
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
            event.preventDefault()
            run()
          }}
        />
        <div className="chat-options">
          <button type="button" className="chat-picker" aria-pressed={stream} onClick={() => onStream(!stream)}>
            <span className="chat-picker-value">{words.stream(stream)}</span>
          </button>
          <button type="button" className="chat-picker" aria-pressed={images} onClick={() => onImages(!images)}>
            <span className="chat-picker-value">{words.images(images)}</span>
          </button>
          <button type="button" className="chat-input-button" aria-label={words.run} title={words.run} disabled={text.trim() === ''} onClick={run}>
            <EnterIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
