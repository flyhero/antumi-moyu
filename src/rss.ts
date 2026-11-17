// A small RSS 2.0 reader: just the item fields the forums' feeds carry.

export type RssItem = {
  title: string | null
  link: string | null
  creator: string | null
  category: string | null
  description: string | null
  pubDate: string | null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

// One pass, so "&amp;lt;" stays "&lt;" rather than becoming "<".
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (whole, dec?: string, hex?: string, name?: string) => {
    if (name) return ENTITIES[name] ?? whole
    const code = dec ? Number(dec) : parseInt(hex ?? '', 16)
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

// CDATA is taken as it is and everything around it is decoded.
function textOf(raw: string): string {
  return raw
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) => (part.startsWith('<![CDATA[') ? part.slice(9, -3) : decodeEntities(part)))
    .join('')
    .trim()
}

function field(item: string, tag: string): string | null {
  const found = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(item)
  if (!found || found[1] === undefined) return null
  return textOf(found[1])
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = []
  for (const found of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const item = found[1] ?? ''
    items.push({
      title: field(item, 'title'),
      link: field(item, 'link'),
      creator: field(item, 'dc:creator'),
      category: field(item, 'category'),
      description: field(item, 'description'),
      pubDate: field(item, 'pubDate')
    })
  }
  return items
}
