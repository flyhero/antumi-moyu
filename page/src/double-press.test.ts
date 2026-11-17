import { describe, expect, it } from 'vitest'
import { doublePress } from './double-press'

describe('doublePress', () => {
  it('fires on the second press within the window', () => {
    let now = 0
    const press = doublePress(1000, () => now)
    expect(press()).toBe(false)
    now = 900
    expect(press()).toBe(true)
  })

  it('does not fire when the presses are too far apart', () => {
    let now = 0
    const press = doublePress(1000, () => now)
    press()
    now = 1001
    expect(press()).toBe(false)
    now = 1500
    expect(press()).toBe(true)
  })

  it('starts over after firing, so a third press is a first', () => {
    let now = 0
    const press = doublePress(1000, () => now)
    press()
    now = 100
    expect(press()).toBe(true)
    now = 200
    expect(press()).toBe(false)
  })
})
