import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshOnExpiry } from './refresh-on-expiry'

class Visibility extends EventTarget {
  hidden = false
  show() {
    this.hidden = false
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

describe('list refresh on cache expiry', () => {
  const cleanup: (() => void)[] = []
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    for (const cancel of cleanup.splice(0)) cancel()
    vi.useRealTimers()
  })

  it('refreshes once at expiry, without repeatedly retrying', () => {
    const refresh = vi.fn()
    const visibility = new Visibility()
    cleanup.push(refreshOnExpiry(180_000, refresh, visibility))
    vi.advanceTimersByTime(179_999)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(360_000)
    visibility.show()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('uses the remaining cache lifetime when returning to a list', () => {
    vi.setSystemTime(120_000)
    const refresh = vi.fn()
    cleanup.push(refreshOnExpiry(180_000, refresh, new Visibility()))
    vi.advanceTimersByTime(59_999)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('defers an expired hidden list until visible, then requests once', () => {
    const refresh = vi.fn()
    const visibility = new Visibility()
    visibility.hidden = true
    cleanup.push(refreshOnExpiry(180_000, refresh, visibility))
    vi.advanceTimersByTime(540_000)
    expect(refresh).not.toHaveBeenCalled()
    visibility.show()
    visibility.show()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh early when the page becomes visible', () => {
    const refresh = vi.fn()
    const visibility = new Visibility()
    cleanup.push(refreshOnExpiry(180_000, refresh, visibility))
    vi.advanceTimersByTime(60_000)
    visibility.show()
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(120_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('cancels both the timer and visibility check on leaving a list', () => {
    const refresh = vi.fn()
    const visibility = new Visibility()
    const cancel = refreshOnExpiry(180_000, refresh, visibility)
    cancel()
    vi.advanceTimersByTime(180_000)
    visibility.show()
    expect(refresh).not.toHaveBeenCalled()
  })
})
