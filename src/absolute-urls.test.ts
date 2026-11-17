import { describe, expect, it } from 'vitest'
import { absoluteLinks, absoluteUrl } from './absolute-urls.js'

describe('absoluteLinks', () => {
  it('makes site-relative and protocol-relative src and href absolute', () => {
    const html = `<a href="/t/topic/1">x</a><img src='/uploads/a.png'><img src="//cdn.example.com/b.png">`
    expect(absoluteLinks(html, 'https://linux.do')).toBe(
      `<a href="https://linux.do/t/topic/1">x</a><img src='https://linux.do/uploads/a.png'><img src="https://cdn.example.com/b.png">`
    )
  })

  it('leaves absolute, mailto and fragment links, and other attributes, alone', () => {
    const html = `<a href="https://a.com/x">a</a><a href="mailto:a@b.c">m</a><a href="#top">t</a><a data-download-href="/uploads/x?dl=1">d</a>`
    expect(absoluteLinks(html, 'https://linux.do')).toBe(html)
  })
})

describe('absoluteUrl', () => {
  it('resolves against the base and keeps only https', () => {
    expect(absoluteUrl('/a/b.png', 'https://linux.do')).toBe('https://linux.do/a/b.png')
    expect(absoluteUrl('//cdn.v2ex.com/a.png', 'https://www.v2ex.com')).toBe('https://cdn.v2ex.com/a.png')
    expect(absoluteUrl('http://a.com/a.png', 'https://linux.do')).toBeNull()
    expect(absoluteUrl('', 'https://linux.do')).toBeNull()
    expect(absoluteUrl(null, 'https://linux.do')).toBeNull()
  })
})
