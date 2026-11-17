import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRss } from './rss.js'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('parseRss', () => {
  it('reads every item of a real feed', () => {
    const items = parseRss(fixture('linuxdo-latest.rss'))
    expect(items).toHaveLength(5)
    expect(items[0]).toMatchObject({
      title: '开了个Google Ultra 20x，有什么隐藏权益可以领以及正常用argon周限有多少刀',
      link: 'https://linux.do/t/topic/3192714',
      creator: 'inm',
      category: '搞七捻三',
      pubDate: 'Tue, 17 Nov 2026 13:12:34 +0000'
    })
    expect(items[0]?.description).toContain('<small>1 个帖子 - 1 位参与者</small>')
  })

  it('does not take the channel head or atom:link for an item', () => {
    expect(parseRss(fixture('linuxdo-category.rss'))).toHaveLength(3)
  })

  it('decodes the five entities once, around CDATA', () => {
    const [item] = parseRss(`<rss><channel><item>
      <title>a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &amp;lt;</title>
      <description><![CDATA[<p>x &amp; y</p>]]></description>
    </item></channel></rss>`)
    expect(item?.title).toBe('a & b <c> "d" \'e\' &lt;')
    expect(item?.description).toBe('<p>x &amp; y</p>')
  })

  it('decodes numeric references', () => {
    expect(parseRss('<item><title>&#20013;&#x6587;</title></item>')[0]?.title).toBe('中文')
  })

  it('leaves missing fields null', () => {
    expect(parseRss('<item><title>only</title></item>')).toEqual([
      { title: 'only', link: null, creator: null, category: null, description: null, pubDate: null }
    ])
  })

  it('returns nothing for text that is not a feed', () => {
    expect(parseRss('<html>Just a moment</html>')).toEqual([])
    expect(parseRss('')).toEqual([])
  })
})
