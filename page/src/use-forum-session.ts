import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { ForumAccount } from '../../src/community'
import { forumCoolingDown, noteForumRefusal } from './forum-cooldown'
import type { PageHost } from './host'
import { callReader, errorMessage } from './reader-client'

// Switching windows focuses the page in bursts. Wait until that stops, and skip a check that just ran.
export const focusCheckDelay = 1_000

export function useForumSession(host: PageHost) {
  const [account, setAccount] = useState<ForumAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the first check has answered, either way: what reads as whom waits for it.
  const [settled, setSettled] = useState(false)
  const generation = useRef(0)
  const checking = useRef(false)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const checkedAt = useRef(0)
  const cancelFocusCheck = () => { clearTimeout(focusTimer.current); focusTimer.current = undefined }
  // A check the page starts itself must not mark the buttons busy. The first click into the page
  // focuses it, and that focus checks the session: if the buttons disable before mouseup, the click
  // never arrives and the browser stays closed until the next one.
  const check = useCallback(async (quiet = false) => {
    cancelFocusCheck()
    if (checking.current) return
    // Quiet focus checks must not keep hitting a forum that just asked us to wait.
    if (quiet && forumCoolingDown()) return
    checking.current = true
    checkedAt.current = Date.now()
    const ticket = generation.current
    if (!quiet) setBusy(true)
    try {
      const next = ForumAccount.nullable().parse(await callReader(host, 'session', undefined))
      if (ticket !== generation.current) return
      setAccount(next)
      if (next) setAwaiting(false)
      setError(null)
    } catch (error) {
      if (ticket === generation.current) {
        const message = errorMessage(error)
        noteForumRefusal(message)
        setError(message)
      }
    } finally {
      checking.current = false
      if (ticket === generation.current) setSettled(true)
      if (!quiet && ticket === generation.current) setBusy(false)
    }
  }, [host])
  useEffect(() => {
    void check(true)
    const focus = () => {
      cancelFocusCheck()
      if (Date.now() - checkedAt.current < focusCheckDelay) return
      focusTimer.current = setTimeout(() => { focusTimer.current = undefined; void check(true) }, focusCheckDelay)
    }
    window.addEventListener('focus', focus)
    return () => { generation.current += 1; cancelFocusCheck(); window.removeEventListener('focus', focus) }
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
    cancelFocusCheck()
    setBusy(true); setError(null)
    try {
      await callReader(host, 'logout', undefined)
      setAccount(null); setAwaiting(false)
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return { account, settled, busy, awaiting, error, check, login, logout }
}
