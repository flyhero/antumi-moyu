import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { ForumAccount } from '../../src/community'
import type { PageHost } from './host'
import { callReader, errorMessage } from './reader-client'

export function useForumSession(host: PageHost) {
  const [account, setAccount] = useState<ForumAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const checking = useRef(false)
  // A check the page starts itself must not mark the buttons busy. The first click into the page
  // focuses it, and that focus checks the session: if the buttons disable before mouseup, the click
  // never arrives and the browser stays closed until the next one.
  const check = useCallback(async (quiet = false) => {
    if (checking.current) return
    checking.current = true
    const ticket = generation.current
    if (!quiet) setBusy(true)
    try {
      const next = ForumAccount.nullable().parse(await callReader(host, 'session', undefined))
      if (ticket !== generation.current) return
      setAccount(next)
      if (next) setAwaiting(false)
      setError(null)
    } catch (error) {
      if (ticket === generation.current) setError(errorMessage(error))
    } finally {
      checking.current = false
      if (!quiet && ticket === generation.current) setBusy(false)
    }
  }, [host])
  useEffect(() => {
    void check(true)
    const focus = () => void check(true)
    window.addEventListener('focus', focus)
    return () => { generation.current += 1; window.removeEventListener('focus', focus) }
  }, [check])
  const login = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try { await callReader(host, 'login', undefined); setAwaiting(true) }
    catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const logout = async () => {
    if (busy) return
    generation.current += 1
    setBusy(true); setError(null)
    try {
      await callReader(host, 'logout', undefined)
      setAccount(null); setAwaiting(false)
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return { account, busy, awaiting, error, check, login, logout }
}
