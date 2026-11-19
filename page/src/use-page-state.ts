import { useCallback, useRef, useState } from 'preact/hooks'
import type { PageHost } from './host'
import { fitSavedState, readSavedState, type SavedState } from './saved-state'

// One writer: a preference change must never replace the drafts or reading positions.
export function usePageState(host: PageHost) {
  const [state, setState] = useState(() => readSavedState(host.state))
  const current = useRef(state)
  const [storageError, setStorageError] = useState(false)
  const update = useCallback((change: (state: SavedState) => SavedState) => {
    const next = change(current.current)
    if (next === current.current) return
    current.current = next
    setState(next)
    const fitted = fitSavedState(next)
    try {
      if (!fitted) {
        // Even when a new draft cannot fit, remove sent drafts and preserve send guards on disk.
        const before = readSavedState(host.state)
        const drafts = Object.fromEntries(Object.entries(before.drafts).filter(([key]) => next.drafts[key]).map(([key, draft]) => [key, { ...draft, uncertain: next.drafts[key]?.uncertain ?? draft.uncertain }]))
        const fallback = fitSavedState({ ...before, drafts })
        if (fallback) host.setState(fallback)
        setStorageError(true)
        return
      }
      host.setState(fitted)
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [host])
  return { state, update, storageError }
}
export type PageState = ReturnType<typeof usePageState>
