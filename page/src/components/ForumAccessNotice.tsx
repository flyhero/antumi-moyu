import { useEffect, useState } from 'preact/hooks'
import type { Words } from '../dictionary'
import { forumAccessState, onForumAccessChange } from '../forum-cooldown'

export function ForumAccessNotice({ words, onVerify, onResume, busy }: { words: Words; onVerify: () => void; onResume: () => void; busy: boolean }) {
  const [access, setAccess] = useState(forumAccessState)
  const [now, setNow] = useState(Date.now)
  useEffect(() => onForumAccessChange(() => { setAccess(forumAccessState()); setNow(Date.now()) }), [])
  useEffect(() => {
    if (!access || access.kind === 'challenge') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [access])
  if (!access) return null
  const challenge = access.kind === 'challenge'
  const seconds = challenge ? 0 : Math.max(0, Math.ceil((access.until - now) / 1000))
  return <div className="forum-access-notice" role={challenge ? 'alert' : 'status'} data-challenge={challenge || undefined}>
    <span>{challenge ? (access.again ? words.forumStillChallenged : words.forumChallenge) : seconds > 0 ? words.forumRateLimited(seconds) : words.forumCanResume}</span>
    <div className="forum-access-actions">
      {challenge && <button type="button" className="button" disabled={busy} onClick={onVerify}>{words.forumVerify}</button>}
      <button type="button" className="button" disabled={busy || seconds > 0} onClick={onResume}>{challenge ? words.forumVerificationDone : words.forumResume}</button>
    </div>
  </div>
}
