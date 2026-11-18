// A hidden page waits until it is visible. Each cache entry gets one attempt; its successful
// replacement schedules the next, while a failed request leaves retrying to the reader.
export function refreshOnExpiry(expiresAt: number, refresh: () => void, visibility: EventTarget & { readonly hidden: boolean } = document): () => void {
  let requested = false
  const check = () => {
    if (requested || visibility.hidden || Date.now() < expiresAt) return
    requested = true
    refresh()
  }
  const timer = setTimeout(check, Math.max(0, expiresAt - Date.now()))
  visibility.addEventListener('visibilitychange', check)
  return () => {
    clearTimeout(timer)
    visibility.removeEventListener('visibilitychange', check)
  }
}
