import { describe, expect, it } from 'vitest'
import { findChannel, parseCommand } from './commands'

describe('parseCommand', () => {
  it('reads the one-letter commands and their words', () => {
    expect(parseCommand('n')).toEqual({ kind: 'next' })
    expect(parseCommand(' R ')).toEqual({ kind: 'refresh' })
    expect(parseCommand('o')).toEqual({ kind: 'open' })
    expect(parseCommand('q')).toEqual({ kind: 'leave' })
    expect(parseCommand('?')).toEqual({ kind: 'help' })
    expect(parseCommand('/help')).toEqual({ kind: 'help' })
  })

  it('reads nothing as nothing', () => {
    expect(parseCommand('   ')).toEqual({ kind: 'none' })
  })

  it('reads a number as a floor', () => {
    expect(parseCommand('12')).toEqual({ kind: 'floor', floor: 12 })
    expect(parseCommand('#3')).toEqual({ kind: 'floor', floor: 3 })
    expect(parseCommand('1234567').kind).toBe('unknown')
  })

  it('switches community by its name, before any channel', () => {
    expect(parseCommand('/linuxdo')).toEqual({ kind: 'community', community: 'linuxdo' })
    expect(parseCommand('/linux.do')).toEqual({ kind: 'community', community: 'linuxdo' })
    expect(parseCommand('/V2EX')).toEqual({ kind: 'community', community: 'v2ex' })
  })

  it('reads any other slash word as a channel', () => {
    expect(parseCommand('/hot')).toEqual({ kind: 'channel', name: 'hot' })
    expect(parseCommand('/开发调优')).toEqual({ kind: 'channel', name: '开发调优' })
  })

  it('calls the rest unknown', () => {
    expect(parseCommand('hello')).toEqual({ kind: 'unknown', text: 'hello' })
    expect(parseCommand('/')).toEqual({ kind: 'unknown', text: '/' })
    expect(parseCommand('/two words')).toEqual({ kind: 'unknown', text: '/two words' })
    expect(parseCommand('constructor')).toEqual({ kind: 'unknown', text: 'constructor' })
  })
})

describe('findChannel', () => {
  const channels = [{ id: 'latest', name: '最新' }, { id: 'python', name: 'Python' }, { id: 'develop', name: '开发调优' }]

  it('finds a channel by id or name, in any case', () => {
    expect(findChannel(channels, 'LATEST')?.id).toBe('latest')
    expect(findChannel(channels, 'python')?.id).toBe('python')
    expect(findChannel(channels, '开发调优')?.id).toBe('develop')
  })

  it('finds nothing for an unknown name', () => {
    expect(findChannel(channels, 'rust')).toBeNull()
  })
})
