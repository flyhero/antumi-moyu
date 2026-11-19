import { useState } from 'preact/hooks'
import type { CommunityId } from '../../../src/community'
import { avatarDisguise } from '../avatar-disguise'
import { isHttpsUrl } from '../forum-html-rules'
import { AgentLogo } from './AgentLogo'

// Where a turn's agent icon goes: the author's picture in a small circle, or their initial when the
// forum gives none or it does not load.
export function Avatar({ src, name, community, disguise }: { src: string | null; name: string; community: CommunityId; disguise: boolean }) {
  const [failed, setFailed] = useState(false)
  if (disguise) {
    const { agent, tone } = avatarDisguise(community, name)
    return <span className="chat-turn-head-icon chat-avatar chat-avatar-agent" data-agent={agent} data-tone={tone} aria-hidden="true"><AgentLogo agent={agent} /></span>
  }
  const shown = src !== null && isHttpsUrl(src) && !failed
  return (
    <span className="chat-turn-head-icon chat-avatar" aria-hidden="true">
      {shown
        ? <img src={src} alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="chat-avatar-initial">{Array.from(name)[0]?.toUpperCase() ?? '?'}</span>}
    </span>
  )
}
