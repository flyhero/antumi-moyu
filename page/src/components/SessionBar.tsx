import type { Words } from '../dictionary'
import type { useForumSession } from '../use-forum-session'

export function SessionBar({ session, words }: { session: ReturnType<typeof useForumSession>; words: Words }) {
  return <div className="session-bar">
    <span className="muted">{session.account?.username ?? (session.awaiting ? words.loginInBrowser : words.notLoggedIn)}</span>
    {!session.account && <button type="button" className="link-button" disabled={session.busy} onClick={() => void session.login()}>{words.login}</button>}
    <button type="button" className="link-button" disabled={session.busy} onClick={() => void session.check()}>{session.busy ? words.checkingLogin : words.checkLogin}</button>
    {session.account && <button type="button" className="link-button" disabled={session.busy} onClick={() => void session.logout()}>{words.logout}</button>}
    {session.error && <span className="session-error" role="alert">{session.error}</span>}
  </div>
}
