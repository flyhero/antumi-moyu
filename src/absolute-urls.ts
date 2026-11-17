// Forum HTML carries site-relative links; the page shows it outside the forum, so they must stand alone.

// Resolved against an https base; anything that does not end up https is refused.
export function absoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

// Only "/…" and "//host/…" are rewritten; absolute, mailto: and #fragment values are left alone.
export function absoluteLinks(html: string, base: string): string {
  return html.replace(/(\s(?:src|href)=)(["'])(\/[^"']*)\2/gi, (whole, attribute: string, quote: string, value: string) => {
    const resolved = absoluteUrl(value, base)
    return resolved ? `${attribute}${quote}${resolved}${quote}` : whole
  })
}
