import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import type { ReadingPosition } from './saved-state'
import type { ThreadState } from './use-reader'

export function useReadingPosition(key: string | null, thread: ThreadState | null, streaming: boolean, onPosition: (key: string, position: ReadingPosition) => void) {
  const list = useRef<HTMLDivElement>(null)
  const applied = useRef<number | null>(null)
  const ready = useRef(false)
  const save = useRef(onPosition)
  save.current = onPosition
  const focus = thread?.focus
  const pages = thread?.pages
  useLayoutEffect(() => {
    const container = list.current
    if (!container || !pages?.length || streaming) return
    if (focus && applied.current !== focus.ticket) {
      const entries = [...container.querySelectorAll<HTMLElement>('[data-reading-floor]')]
      const target = entries.find((element) => Number(element.dataset.readingFloor) === focus.floor)
        ?? entries.toSorted((a, b) => Math.abs(Number(a.dataset.readingFloor) - (focus.floor ?? 0)) - Math.abs(Number(b.dataset.readingFloor) - (focus.floor ?? 0)))[0]
      if (target) {
        container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - focus.offset
        if (focus.flash) {
          target.setAttribute('data-flash', '')
          setTimeout(() => target.removeAttribute('data-flash'), 1200)
        }
      }
      applied.current = focus.ticket
    }
    ready.current = true
  }, [focus, pages, streaming])

  useEffect(() => {
    const container = list.current
    if (!container || !key) return
    let latest: ReadingPosition | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      clearTimeout(timer)
      timer = undefined
      if (latest) { save.current(key, latest); latest = null }
    }
    const scroll = () => {
      if (!ready.current) return
      const top = container.getBoundingClientRect().top
      const entries = [...container.querySelectorAll<HTMLElement>('[data-reading-floor]')]
      const element = entries.find((element) => element.getBoundingClientRect().bottom > top + 8)
      if (!element) return
      latest = { floor: Number(element.dataset.readingFloor), page: Number(element.dataset.readingPage), offset: Math.round(element.getBoundingClientRect().top - top) }
      if (!timer) timer = setTimeout(flush, 250)
    }
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    container.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      flush()
      container.removeEventListener('scroll', scroll)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [key])
  return list
}
