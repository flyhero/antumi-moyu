import { useRef, useState } from 'preact/hooks'
import type { Words } from '../dictionary'
import { EnterIcon, HashIcon } from './icons'

export function FloorJump({ words, onJump }: { words: Words; onJump: (floor: number) => void }) {
  const [value, setValue] = useState('')
  const panel = useRef<HTMLDetailsElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const jump = () => {
    if (!input.current?.reportValidity()) return
    const floor = Number(value)
    if (!/^\d{1,7}$/.test(value) || !Number.isSafeInteger(floor) || floor > 1_000_000) return
    onJump(floor)
    if (panel.current) panel.current.open = false
  }
  return (
    <details className="menu-anchor floor-jump" ref={panel}
      onToggle={() => { if (panel.current?.open) input.current?.focus() }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        event.currentTarget.open = false
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        event.preventDefault()
        if (panel.current) panel.current.open = false
      }}>
      <summary className="tool-button" aria-label={words.jumpToFloor} title={words.jumpToFloor}><HashIcon /></summary>
      {/* The plugin sandbox disallows HTML form submission, including submit events. */}
      <div className="menu menu-end floor-jump-form" role="group" aria-label={words.jumpToFloor}>
        <input ref={input} type="number" className="floor-input" aria-label={words.floorNumber} placeholder={words.floorNumber}
          required min={0} max={1_000_000} step={1} value={value} onInput={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.isComposing) return
            event.preventDefault()
            jump()
          }} />
        <button type="button" className="tool-button" aria-label={words.jump} title={words.jump} onClick={jump}><EnterIcon /></button>
      </div>
    </details>
  )
}
