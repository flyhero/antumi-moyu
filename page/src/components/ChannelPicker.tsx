import { useEffect, useRef, useState } from 'preact/hooks'
import type { Channel } from '../../../src/community'
import type { Words } from '../dictionary'
import { CheckIcon, ChevronDownIcon } from './icons'

// Antumi's picker: a value as wide as its words with a small chevron, opening a menu of choices.
export function ChannelPicker({ channels, current, words, onPick }: {
  channels: readonly Channel[]
  current: Channel | null
  words: Words
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && anchor.current?.contains(event.target)) return
      setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="menu-anchor" ref={anchor}>
      <button type="button" className="chat-picker" aria-label={words.channel} aria-haspopup="listbox" aria-expanded={open} disabled={!current} onClick={() => setOpen(!open)}>
        <span className="chat-picker-value">{current?.name ?? '…'}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="menu menu-end" role="listbox" aria-label={words.channel}>
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              role="option"
              className="menu-item"
              aria-selected={channel.id === current?.id}
              onClick={() => {
                setOpen(false)
                onPick(channel.id)
              }}
            >
              <span className="menu-item-label">{channel.name}</span>
              <span className="menu-check">{channel.id === current?.id && <CheckIcon />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
