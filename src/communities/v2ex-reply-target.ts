// "@name" in the reply text, with or without the link V2EX wraps it in, then an optional "#floor".
const MENTION = /@(?:<a [^>]*>)?([A-Za-z0-9_-]+)(?:<\/a>)?(?:\s*#(\d+))?/g

// V2EX has no reply-to field. A "#12" after the name names the floor outright; otherwise it is the
// nearest earlier reply by that name.
export function v2exReplyTarget(html: string, floor: number, authors: Map<number, string>): number | null {
  for (const [, name, number] of html.matchAll(MENTION)) {
    if (!name) continue
    const wanted = name.toLowerCase()
    const named = number ? Number(number) : 0
    if (named >= 1 && named < floor && authors.get(named)?.toLowerCase() === wanted) return named
    let nearest = 0
    for (const [number, author] of authors) {
      if (number < floor && number > nearest && author.toLowerCase() === wanted) nearest = number
    }
    if (nearest) return nearest
  }
  return null
}
