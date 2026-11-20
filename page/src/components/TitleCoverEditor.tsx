import { useEffect, useRef, useState } from 'preact/hooks'
import type { Words } from '../dictionary'
import { reconcileTitles, sameTitleCovers, TITLE_CHARS, TITLE_LIMIT, type TitleCover } from '../title-disguise'
import { ChevronDownIcon, TitleDisguiseIcon } from './icons'

// The list the user writes, one sentence a line. Closing it is what remembers the list.
export function TitleCoverEditor({ words, disguiseTitles, covers, onDisguiseTitles, onChange }: {
  words: Words
  disguiseTitles: boolean
  covers: readonly TitleCover[]
  onDisguiseTitles: (disguise: boolean) => void
  onChange: (covers: TitleCover[]) => void
}) {
  const anchor = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const coversRef = useRef(covers)
  const onChangeRef = useRef(onChange)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const draftRef = useRef(draft)
  coversRef.current = covers
  onChangeRef.current = onChange
  draftRef.current = draft
  const persist = () => {
    const next = reconcileTitles(coversRef.current, draftRef.current)
    setOpen(false)
    if (!sameTitleCovers(coversRef.current, next)) onChangeRef.current(next)
  }
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => {
    if (!open) return
    field.current?.focus()
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && anchor.current?.contains(event.target)) return
      persistRef.current()
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])
  return (
    <div className="title-cover-anchor" ref={anchor} data-open={open ? '' : undefined}>
      <button type="button" className="chat-picker reading-toggle" aria-label={words.titles(disguiseTitles)} data-tooltip={words.titles(disguiseTitles)} aria-pressed={disguiseTitles} onClick={() => onDisguiseTitles(!disguiseTitles)}>
        <TitleDisguiseIcon active={disguiseTitles} />
      </button>
      <button
        type="button"
        className="chat-picker title-cover-edit"
        aria-label={words.editTitleCovers}
        data-tooltip={words.editTitleCovers}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) persist()
          else {
            setDraft(covers.map((cover) => cover.text).join('\n'))
            setOpen(true)
          }
        }}
      ><ChevronDownIcon /></button>
      {open && (
        <div className="title-cover-editor" role="dialog" aria-label={words.editTitleCovers}>
          <p className="title-cover-hint" id="title-cover-hint">{words.titleCoversHint}</p>
          <textarea
            ref={field}
            className="title-cover-field"
            aria-label={words.editTitleCovers}
            aria-describedby="title-cover-hint"
            placeholder={words.titleCoversPlaceholder}
            rows={8}
            maxLength={TITLE_LIMIT * (TITLE_CHARS + 1)}
            value={draft}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              persist()
            }}
          />
        </div>
      )}
    </div>
  )
}
