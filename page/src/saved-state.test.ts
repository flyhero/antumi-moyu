import { describe, expect, it } from 'vitest'
import { defaultState, markRead, READ_LIMIT, readSavedState, type SavedState } from './saved-state'

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
    expect(state).toEqual({ community: 'v2ex', channel: 'python', stream: false, images: false, read: { 'v2ex:123': 4, 'linuxdo:78': 20 } })
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
