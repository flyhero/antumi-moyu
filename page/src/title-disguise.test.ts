import { describe, expect, it } from 'vitest'
import { builtinCovers, coverFor, coversFor, readTitleCovers, reconcileTitles, TITLE_CHARS, TITLE_LIMIT } from './title-disguise'

const covers = [
  { id: 'u1', text: '看一下侧栏' },
  { id: 'u2', text: '核一下发布' },
  { id: 'u3', text: '整理草稿' }
]

function keyFor(text: string): string {
  for (let id = 1; id < 500; id += 1) {
    const key = `linuxdo:${id}`
    if (coverFor(key, covers) === text) return key
  }
  throw new Error(text)
}

describe('title covers', () => {
  it('ships a frozen sentence for each language and lets a custom list replace it', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const builtin = builtinCovers(locale)
      expect(builtin.length).toBeGreaterThan(100)
      expect(new Set(builtin.map((cover) => cover.id)).size).toBe(builtin.length)
      expect(new Set(builtin.map((cover) => cover.text)).size).toBe(builtin.length)
      expect(builtin.every((cover) => cover.text.length > 0 && cover.text.length <= TITLE_CHARS)).toBe(true)
      expect(coversFor(locale, [])).toBe(builtin)
    }
    expect(coverFor('linuxdo:42', builtinCovers('zh-CN'))).toBe('接着处理通知角标')
    expect(coverFor('linuxdo:42', builtinCovers('en'))).toBe('Check the shortcut')
    expect(coversFor('zh-CN', [{ id: 'u1', text: '自己的' }])).toEqual([{ id: 'u1', text: '自己的' }])
    expect(coverFor('linuxdo:42', [])).toBeNull()
  })

  it('keeps a topic on a sentence when its words change, and moves it only when that sentence is removed', () => {
    const kept = keyFor('看一下侧栏')
    const moved = keyFor('核一下发布')
    const edited = reconcileTitles(covers, '看一下侧栏\n核一下宽度\n整理草稿')
    expect(edited).toEqual([
      { id: 'u1', text: '看一下侧栏' },
      { id: 'u2', text: '核一下宽度' },
      { id: 'u3', text: '整理草稿' }
    ])
    expect(coverFor(kept, edited)).toBe('看一下侧栏')
    expect(coverFor(moved, edited)).toBe('核一下宽度')
    const reordered = reconcileTitles(covers, '整理草稿\n看一下侧栏\n核一下发布')
    expect(coverFor(kept, reordered)).toBe('看一下侧栏')
    expect(coverFor(moved, reordered)).toBe('核一下发布')
    const removed = reconcileTitles(covers, '看一下侧栏\n整理草稿')
    expect(removed.map((cover) => cover.id)).toEqual(['u1', 'u3'])
    expect(coverFor(kept, removed)).toBe('看一下侧栏')
    expect(coverFor(moved, removed)).not.toBe('核一下发布')
  })

  it('stores at most 40 lines of 40 characters, dropping blanks', () => {
    const text = ['', '  看一下侧栏  ', ...Array.from({ length: 45 }, (_, index) => `句子${index}${'字'.repeat(50)}`)].join('\n')
    const next = reconcileTitles([], text)
    expect(next).toHaveLength(TITLE_LIMIT)
    expect(next[0]).toEqual({ id: 'u1', text: '看一下侧栏' })
    expect(next[1]?.text).toHaveLength(TITLE_CHARS)
    expect(next[TITLE_LIMIT - 1]?.id).toBe(`u${TITLE_LIMIT}`)
  })

  it('reads only the user\'s own sentences back', () => {
    expect(readTitleCovers(null)).toEqual([])
    expect(readTitleCovers([
      { id: 'u1', text: '看一下侧栏' },
      { id: 'u1', text: '重复' },
      { id: 'zh:0:0', text: '内置' },
      { id: 'u2', text: '   ' },
      { id: 'u3', text: `  ${'字'.repeat(50)}` }
    ])).toEqual([
      { id: 'u1', text: '看一下侧栏' },
      { id: 'u3', text: '字'.repeat(TITLE_CHARS) }
    ])
  })
})
