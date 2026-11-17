import { describe, expect, it } from 'vitest'
import { excerpt, isEmojiImage, isHttpsUrl, isWebUrl, sizeOf } from './forum-html-rules'

describe('isHttpsUrl', () => {
  it('takes https alone', () => {
    expect(isHttpsUrl('https://cdn.v2ex.com/avatar/a.png')).toBe(true)
    expect(isHttpsUrl('HTTPS://linux.do/images/emoji/twemoji/hugs.png?v=12')).toBe(true)
    expect(isHttpsUrl('http://example.com/a.png')).toBe(false)
    expect(isHttpsUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isHttpsUrl('//cdn.example.com/a.png')).toBe(false)
    expect(isHttpsUrl('/uploads/a.png')).toBe(false)
    expect(isHttpsUrl('https://')).toBe(false)
    expect(isHttpsUrl('https://a b.png')).toBe(false)
  })
})

describe('isWebUrl', () => {
  it('takes http and https, nothing else', () => {
    expect(isWebUrl('https://linux.do/t/topic/1')).toBe(true)
    expect(isWebUrl('http://example.com')).toBe(true)
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
    expect(isWebUrl('mailto:a@b.c')).toBe(false)
    expect(isWebUrl('/member/x')).toBe(false)
  })
})

describe('isEmojiImage', () => {
  const emoji = 'https://cdn.ldstatic.com/images/emoji/twemoji/hugs.png?v=12'

  it('trusts the forum mark', () => {
    expect(isEmojiImage(emoji, true, null, null)).toBe(true)
  })

  it('takes a small known size as an emoji', () => {
    expect(isEmojiImage(emoji, false, 20, 20)).toBe(true)
    expect(isEmojiImage(emoji, false, 690, 388)).toBe(false)
  })

  it('does not read an unknown size as small', () => {
    expect(isEmojiImage(emoji, false, 1, 1)).toBe(false)
    expect(isEmojiImage(emoji, false, null, 20)).toBe(false)
  })

  it('takes an emoji from the forums alone, however it is marked or sized', () => {
    expect(isEmojiImage('https://cdn3.ldstatic.com/original/3X/3/3/a.png', true, 20, 20)).toBe(true)
    expect(isEmojiImage('https://www.v2ex.com/static/img/a.png', false, 20, 20)).toBe(true)
    expect(isEmojiImage('https://tracker.example/pixel.png', true, 20, 20)).toBe(false)
    expect(isEmojiImage('https://notlinux.do/a.png', true, 20, 20)).toBe(false)
    expect(isEmojiImage('https://linux.do.evil.example/a.png', false, 20, 20)).toBe(false)
  })
})

describe('sizeOf', () => {
  it('reads a plain number only', () => {
    expect(sizeOf('20')).toBe(20)
    expect(sizeOf(' 690 ')).toBe(690)
    expect(sizeOf('100%')).toBeNull()
    expect(sizeOf(null)).toBeNull()
  })
})

describe('excerpt', () => {
  it('folds whitespace and cuts by character', () => {
    expect(excerpt('  hello\n\n  world ', 20)).toBe('hello world')
    expect(excerpt('考古工作认证，后人焚膏继昼啊', 6)).toBe('考古工作认证…')
    expect(excerpt('😀😀😀', 2)).toBe('😀😀…')
  })
})
