import { describe, expect, it } from 'vitest'
import { clampListWidth, LIST_WIDTH_DEFAULT, LIST_WIDTH_MAX, LIST_WIDTH_MIN, readListWidth } from './list-width'

describe('topic list width', () => {
  it('stays between 240 and 480, and within 40% of the page', () => {
    expect(clampListWidth(LIST_WIDTH_DEFAULT, 1280)).toBe(320)
    expect(clampListWidth(80, 1280)).toBe(LIST_WIDTH_MIN)
    expect(clampListWidth(900, 1600)).toBe(LIST_WIDTH_MAX)
    expect(clampListWidth(400, 800)).toBe(320)
    expect(clampListWidth(400, 500)).toBe(LIST_WIDTH_MIN)
  })

  it('keeps a saved width inside the range and restores the default otherwise', () => {
    expect(readListWidth(400)).toBe(400)
    expect(readListWidth(LIST_WIDTH_MIN)).toBe(240)
    expect(readListWidth(LIST_WIDTH_MAX)).toBe(480)
    expect(readListWidth(100)).toBe(LIST_WIDTH_DEFAULT)
    expect(readListWidth(480.5)).toBe(LIST_WIDTH_DEFAULT)
    expect(readListWidth('320')).toBe(LIST_WIDTH_DEFAULT)
  })
})
