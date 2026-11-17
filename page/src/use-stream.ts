import { useRef, useState } from 'preact/hooks'

// Replies arriving one after another, the newest being typed, as an agent's would. `shown` is how
// many of the first page's replies are out; null when all are.
export function useStream() {
  const [shown, setShown] = useState<number | null>(null)
  // Each run of the stream, so a late timer from the last thread cannot move this one on.
  const run = useRef(0)

  return {
    shown,
    start(total: number) {
      run.current++
      setShown(total > 0 ? 1 : null)
    },
    finish() {
      run.current++
      setShown(null)
    },
    // The reply at this index is written out: after a breath, the next one comes.
    typed(index: number, total: number) {
      const current = run.current
      setTimeout(() => {
        if (current !== run.current) return
        setShown((count) => (count === null || count !== index + 1 ? count : count + 1 > total ? null : count + 1))
      }, 60)
    }
  }
}
