import { describe, expect, it } from 'vitest'
import { avatarDisguise } from './avatar-disguise'

describe('avatar disguise identities', () => {
  it('preserves the published mapping across pages, restarts and logo updates', () => {
    expect(avatarDisguise('linuxdo', 'alice')).toEqual({ agent: 'cursor', tone: 0 })
    expect(avatarDisguise('linuxdo', 'bob')).toEqual({ agent: 'dsh', tone: 2 })
    expect(avatarDisguise('linuxdo', '青柠')).toEqual({ agent: 'antigravity', tone: 1 })
    expect(avatarDisguise('v2ex', 'alice')).toEqual({ agent: 'antigravity', tone: 2 })
    expect(avatarDisguise('v2ex', '青柠')).toEqual({ agent: 'claude', tone: 2 })
    expect(avatarDisguise('v2ex', '🦊')).toEqual({ agent: 'pi', tone: 1 })
  })

  it('normalizes username spelling without merging the two communities', () => {
    expect(avatarDisguise('linuxdo', ' Alice ')).toEqual(avatarDisguise('linuxdo', 'alice'))
    expect(avatarDisguise('linuxdo', 'cafe\u0301')).toEqual(avatarDisguise('linuxdo', 'café'))
    expect(avatarDisguise('linuxdo', 'alice')).not.toEqual(avatarDisguise('v2ex', 'alice'))
  })
})
