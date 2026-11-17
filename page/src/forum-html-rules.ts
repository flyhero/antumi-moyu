// The rules the sanitizer applies to forum HTML that need no DOM to decide.

// Pictures load over https alone: the frame allows nothing else, and http would be mixed content.
export function isHttpsUrl(value: string): boolean {
  if (!/^https:\/\/\S+$/i.test(value)) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

// What a link may lead to: a web page, opened by the host in the browser.
export function isWebUrl(value: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(value)) return false
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

// An emoji is marked so by the forum, or small enough to sit in a line of text. A size of 0 or 1
// means the forum did not know it, not that the picture is tiny.
// Only from the forums' own hosts: an emoji loads without being asked for, and a small picture
// from anywhere else could be there to see who reads the thread.
const FORUM_HOSTS = ['linux.do', 'ldstatic.com', 'v2ex.com']
export function isForumAsset(src: string): boolean {
  try {
    const host = new URL(src).hostname
    return FORUM_HOSTS.some((own) => host === own || host.endsWith(`.${own}`))
  } catch {
    return false
  }
}

export function isEmojiImage(src: string, marked: boolean, width: number | null, height: number | null): boolean {
  if (!isForumAsset(src)) return false
  if (marked) return true
  if (width === null || height === null) return false
  return width > 1 && height > 1 && width <= 40 && height <= 40
}

// A number from an attribute such as width="20".
export function sizeOf(value: string | null): number | null {
  if (value === null || !/^\d{1,5}$/.test(value.trim())) return null
  return Number(value.trim())
}

// The start of a passage, on one line, for a folded quote's header.
export function excerpt(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(line)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : line
}
