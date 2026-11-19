import { describe, expect, it } from 'vitest'
import { defaultState, fitSavedState, markRead, READ_LIMIT, readSavedState, savePosition, scopeKey, STATE_BYTES, type SavedState } from './saved-state'

describe('readSavedState', () => {
  it('falls back to the defaults for nothing or junk', () => {
    expect(readSavedState(null)).toEqual(defaultState)
    expect(readSavedState('linuxdo')).toEqual(defaultState)
    expect(readSavedState([1, 2])).toEqual(defaultState)
  })

  it('keeps what is valid and drops what is not, field by field', () => {
    const state = readSavedState({
      community: 'v2ex',
      channel: 'python',
      stream: false,
      images: 'yes',
      read: { 'v2ex:123': 4, 'linuxdo:9': -1, 'reddit:1': 3, 'v2ex:abc': 2, 'linuxdo:77': 1.5, 'linuxdo:78': 20 }
    })
    expect(state).toEqual({ community: 'v2ex', channel: 'python', stream: false, images: false, disguiseAvatars: false, drafts: {}, positions: {}, read: { 'v2ex:123': 4, 'linuxdo:78': 20 } })
  })

  it('round-trips avatar disguise and keeps older saved pages compatible', () => {
    const saved = readSavedState({ community: 'v2ex', disguiseAvatars: true, read: { 'v2ex:123': 4 } })
    expect(readSavedState(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(saved.disguiseAvatars).toBe(true)
    expect(readSavedState({ images: true }).disguiseAvatars).toBe(false)
    expect(readSavedState({ disguiseAvatars: 'true' }).disguiseAvatars).toBe(false)
  })

  it('rejects an unknown community and an empty or long channel', () => {
    expect(readSavedState({ community: 'reddit', channel: '' }).community).toBe('linuxdo')
    expect(readSavedState({ channel: '' }).channel).toBeNull()
    expect(readSavedState({ channel: 'x'.repeat(65) }).channel).toBeNull()
  })

  it('keeps only the newest entries past the limit', () => {
    const read: Record<string, number> = {}
    for (let id = 0; id < READ_LIMIT + 10; id++) read[`linuxdo:${id}`] = 1
    const state = readSavedState({ read })
    expect(Object.keys(state.read)).toHaveLength(READ_LIMIT)
    expect(state.read['linuxdo:0']).toBeUndefined()
    expect(state.read[`linuxdo:${READ_LIMIT + 9}`]).toBe(1)
  })
})

describe('markRead', () => {
  it('keeps the highest floor and moves the topic to the newest end', () => {
    let state: SavedState = { ...defaultState, read: { 'linuxdo:1': 30, 'linuxdo:2': 5 } }
    state = markRead(state, 'linuxdo:1', 12)
    expect(state.read['linuxdo:1']).toBe(30)
    expect(Object.keys(state.read)).toEqual(['linuxdo:2', 'linuxdo:1'])
    state = markRead(state, 'linuxdo:2', 41)
    expect(state.read['linuxdo:2']).toBe(41)
  })

  it('drops the oldest past the limit', () => {
    let state = defaultState
    for (let id = 0; id <= READ_LIMIT; id++) state = markRead(state, `v2ex:${id}`, 1)
    expect(Object.keys(state.read)).toHaveLength(READ_LIMIT)
    expect(state.read['v2ex:0']).toBeUndefined()
    expect(JSON.stringify(state).length).toBeLessThan(32 * 1024)
  })

  it('does not change the state it was given', () => {
    const state = { ...defaultState, read: {} }
    markRead(state, 'v2ex:1', 3)
    expect(state.read).toEqual({})
  })
})

describe('drafts and reading positions', () => {
  it('restores the full draft, reply target and unknown send outcome under its account', () => {
    const key = scopeKey('linuxdo', 'alice:测试', '42')
    const draft = { text: '你好\nsecond line', target: { floor: 3, author: 'bob' }, uncertain: true }
    const state = readSavedState({ drafts: { [key]: draft }, positions: { [key]: { floor: 23, page: 2, offset: -51 } } })
    expect(readSavedState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(state.drafts[key]).toEqual(draft)
    expect(key).not.toBe(scopeKey('linuxdo', 'alice', '42'))
    expect(scopeKey('v2ex', 'alice:测试', '42')).not.toBe(key)
    expect(scopeKey('linuxdo', null, '42')).not.toBe(key)
  })

  it('drops corrupt persisted content without truncating valid drafts', () => {
    const state = readSavedState({ drafts: {
      'v2ex:alice:1': { text: 'ok', target: null },
      'v2ex::2': { text: 'anonymous', target: null },
      'v2ex:alice:3': { text: 'x'.repeat(8001), target: null },
      'v2ex:alice:4': { text: 'bad target', target: { floor: -1, author: 'bob' } }
    }, positions: {
      'v2ex:alice:1': { floor: 3, page: 1, offset: NaN },
      'v2ex:alice:2': { floor: 3, page: -1, offset: 0 }
    } })
    expect(state.drafts).toEqual({ 'v2ex:alice:1': { text: 'ok', target: null, uncertain: false } })
    expect(state.positions).toEqual({})
  })

  it('fits UTF-8 drafts by expiring old history, preserving every draft byte', () => {
    let state: SavedState = { ...defaultState, drafts: { 'linuxdo:alice:42': { text: '汉'.repeat(8000), target: null, uncertain: false } } }
    for (let i = 0; i < READ_LIMIT; i++) state = savePosition(markRead(state, `linuxdo:${i}`, i), `linuxdo:alice:${i}`, { floor: 101, page: 6, offset: -1000 })
    const fitted = fitSavedState(state)
    expect(fitted).not.toBeNull()
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(STATE_BYTES)
    expect(fitted?.drafts).toEqual(state.drafts)
    expect(Object.keys(state.positions)).toHaveLength(READ_LIMIT)
  })

  it('reports insufficient capacity rather than silently dropping a draft', () => {
    const drafts = Object.fromEntries([1, 2].map((id) => [`v2ex:alice:${id}`, { text: '汉'.repeat(8000), target: null, uncertain: false }]))
    expect(fitSavedState({ ...defaultState, drafts })).toBeNull()
    expect(drafts['v2ex:alice:1']?.text).toHaveLength(8000)
  })
})
