import { describe, expect, it } from 'vitest'
import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  it('returns what it holds until it expires', () => {
    let now = 1000
    const cache = new TtlCache<string>(180_000, { now: () => now })
    cache.set('linuxdo:latest', 'topics')
    now += 179_999
    expect(cache.get('linuxdo:latest')).toBe('topics')
    now += 1
    expect(cache.get('linuxdo:latest')).toBeUndefined()
  })

  it('restarts the clock when a key is set again', () => {
    let now = 0
    const cache = new TtlCache<number>(100, { now: () => now })
    cache.set('a', 1)
    now = 90
    cache.set('a', 2)
    now = 150
    expect(cache.get('a')).toBe(2)
  })

  it('drops the oldest entries past its limit', () => {
    const cache = new TtlCache<number>(1000, { limit: 2, now: () => 0 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('forgets a deleted key', () => {
    const cache = new TtlCache<number>(1000)
    cache.set('a', 1)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
  })
})
