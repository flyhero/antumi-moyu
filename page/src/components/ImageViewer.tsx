import { useEffect, useRef, useState } from 'preact/hooks'
import type { Words } from '../dictionary'
import { CloseIcon, ExternalIcon } from './icons'

export type ViewedImage = { src: string; full: string | null; alt: string }

// A picture opened over the page, as large as the frame allows. The full-size copy may be refused
// by the forum's host, so it falls back to the picture already on screen.
export function ImageViewer({ image, words, onOpen, onClose }: {
  image: ViewedImage
  words: Words
  onOpen: (url: string) => void
  onClose: () => void
}) {
  const [src, setSrc] = useState(image.full ?? image.src)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    // Ahead of the page's own keys, so Esc closes this and does not count toward leaving.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={image.alt || words.image} onClick={onClose}>
      <img className="image-viewer-picture" src={src} alt={image.alt} referrerpolicy="no-referrer"
        onError={() => { if (src !== image.src) setSrc(image.src) }} onClick={(event) => event.stopPropagation()} />
      <div className="image-viewer-tools" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="tool-button" title={words.openImage} aria-label={words.openImage} onClick={() => onOpen(image.full ?? image.src)}><ExternalIcon /></button>
        <button ref={close} type="button" className="tool-button" title={words.closeImage} aria-label={words.closeImage} onClick={onClose}><CloseIcon /></button>
      </div>
    </div>
  )
}
