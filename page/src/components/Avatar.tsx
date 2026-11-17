import { useState } from 'preact/hooks'
import { isHttpsUrl } from '../forum-html-rules'

// Where a turn's agent icon goes: the author's picture in a small circle, or their initial when the
// forum gives none or it does not load.
export function Avatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const shown = src !== null && isHttpsUrl(src) && !failed
  return (
    <span className="chat-turn-head-icon chat-avatar" aria-hidden="true">
      {shown
        ? <img src={src} alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="chat-avatar-initial">{Array.from(name)[0]?.toUpperCase() ?? '?'}</span>}
    </span>
  )
}
