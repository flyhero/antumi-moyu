import { useEffect, useRef, useState } from 'preact/hooks'
import { ReplyResult, type ReplyFailure, type ReplyTarget, type Topic } from '../../src/community'
import type { PageHost } from './host'
import type { PageState } from './use-page-state'
import { scopeKey, type Draft } from './saved-state'
import { callReader, errorMessage } from './reader-client'

const EMPTY: Draft = { text: '', target: null, uncertain: false }
type Feedback = { key: string; text: string; error: boolean; failure?: ReplyFailure }

export function useReply(host: PageHost, topic: Topic | null, username: string | null, store: PageState, onSent: (topic: Topic, result: ReplyResult) => void) {
  const key = topic && username ? scopeKey(topic.community, username, topic.id) : ''
  const current = useRef(key)
  current.current = key
  const [sending, setSending] = useState(false)
  const locked = useRef(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [cooldown, setCooldown] = useState<{ key: string; until: number } | null>(null)
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(null), Math.max(0, cooldown.until - Date.now()))
    return () => clearTimeout(timer)
  }, [cooldown])
  const cooling = cooldown?.key === key && cooldown.until > Date.now()
  const draft = store.state.drafts[key] ?? EMPTY
  const { text, target, uncertain } = draft
  const changeDraft = (change: (draft: Draft) => Draft) => {
    if (!key || locked.current) return
    store.update((state) => {
      const next = change(state.drafts[key] ?? EMPTY)
      const drafts = { ...state.drafts }
      if (!next.text && !next.target && !next.uncertain) delete drafts[key]
      else drafts[key] = next
      return { ...state, drafts }
    })
    setFeedback(null)
  }
  const setText = (value: string) => changeDraft((draft) => ({ ...draft, text: value.slice(0, 8000) }))
  const setTarget = (target: ReplyTarget | null) => changeDraft((draft) => ({ ...draft, target }))
  const allowResend = () => changeDraft((draft) => ({ ...draft, uncertain: false }))
  const send = async () => {
    if (!topic || !username || !text.trim() || uncertain || cooling || locked.current) return
    locked.current = true
    setSending(true); setFeedback(null)
    // Closing the page mid-request must reopen with a check-before-resend guard.
    const attempt = { ...draft, uncertain: true }
    store.update((state) => ({ ...state, drafts: { ...state.drafts, [key]: attempt } }))
    const failed = (failure: ReplyFailure) => {
      if (!alive.current) return
      setFeedback({ key, text: failure.message, error: true, failure })
      if (failure.kind !== 'unconfirmed') store.update((state) => state.drafts[key] === attempt ? { ...state, drafts: { ...state.drafts, [key]: { ...attempt, uncertain: false } } } : state)
      if (failure.kind === 'rate-limit' && failure.retryAfter) setCooldown({ key, until: Date.now() + failure.retryAfter * 1000 })
    }
    try {
      const result = ReplyResult.parse(await callReader(host, 'reply', { id: topic.id, content: text, ...(target ? { target } : {}) }))
      if (!alive.current) return
      if (result.state === 'failed') { failed(result.failure); return }
      store.update((state) => {
        if (state.drafts[key] !== attempt) return state
        const drafts = { ...state.drafts }
        delete drafts[key]
        return { ...state, drafts }
      })
      setFeedback({ key, text: result.message ?? '', error: false })
      if (current.current === key) onSent(topic, result)
    } catch (error) {
      // A lost bridge response may hide a completed POST too.
      failed({ kind: 'unconfirmed', message: errorMessage(error) })
    } finally {
      locked.current = false
      if (alive.current) setSending(false)
    }
  }
  return { text, target, uncertain, cooling, setText, setTarget, allowResend, send, sending, feedback: feedback?.key === key ? feedback : null }
}
