import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import type { Words } from '../dictionary'
import { expandImageChip, renderForumHtml, replaceBrokenImage } from '../forum-html'
import { typeOut } from '../typewriter'

// A post's HTML, sanitized and drawn once into a box Preact leaves alone. While `typing`, it is
// written out frame by frame; when typing ends, early or not, it is all there.
export function ForumHtml({ html, showImages, words, typing = false, onTyped, className }: {
  html: string
  showImages: boolean
  words: Words
  typing?: boolean
  onTyped?: () => void
  className: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const typed = useRef(onTyped)
  typed.current = onTyped

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    element.replaceChildren(renderForumHtml(html, { showImages, words }))
    if (!typing) return
    return typeOut(element, () => typed.current?.())
  }, [html, showImages, words, typing])

  // A picture that will not load (a forum's host may refuse a page in a frame) gives way to words.
  useEffect(() => {
    const element = box.current
    if (!element) return
    const failed = (event: Event) => {
      if (event.target instanceof HTMLImageElement) replaceBrokenImage(event.target, words)
    }
    element.addEventListener('error', failed, true)
    return () => element.removeEventListener('error', failed, true)
  }, [words])

  // A folded picture opens in place; links are the app's to open (see App).
  const click = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const chip = target.closest('[data-image-chip]')
    if (!chip || !box.current?.contains(chip)) return
    event.preventDefault()
    expandImageChip(chip)
  }

  return <div ref={box} className={className} onClick={click} />
}
