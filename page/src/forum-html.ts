import DOMPurify from 'dompurify'
import type { Words } from './dictionary'
import { excerpt, isEmojiImage, isHttpsUrl, isWebUrl, sizeOf } from './forum-html-rules'

// A forum's own HTML, made safe and then drawn as a reply in the chat: quotes fold away like a
// thought, pictures fold to a chip, and nothing in it can run, style itself or reach the network
// beyond an https picture.

const purify = DOMPurify(window)

const TAGS = [
  'a', 'abbr', 'aside', 'b', 'bdi', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small',
  'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
]
// class is read once, into a marker of our own, and then dropped: the forum's classes must never
// reach our stylesheet.
const ATTRIBUTES = ['href', 'src', 'alt', 'title', 'width', 'height', 'class', 'colspan', 'rowspan', 'data-username', 'data-post']
const MARK = 'data-forum'
// Plain values, not addresses: DOMPurify holds every allowed attribute that is not marked safe to
// ALLOWED_URI_REGEXP below, which would strip these all.
const PLAIN_VALUES = ['width', 'height', 'colspan', 'rowspan', 'data-username', 'data-post']

// What a forum's classes say about an element, where it matters to how it is drawn.
function markOf(tag: string, classes: readonly string[]): string | null {
  const has = (name: string) => classes.includes(name)
  if (tag === 'IMG' && has('emoji')) return 'emoji'
  if (tag === 'IMG' && has('avatar')) return 'drop'
  if (tag === 'ASIDE' && has('quote')) return 'quote'
  if (tag === 'ASIDE' && has('onebox')) return 'onebox'
  if (has('lightbox-wrapper') || has('lightbox')) return 'lightbox'
  if (has('meta') || has('quote-controls')) return 'drop'
  if (tag === 'DIV' && has('title')) return 'title'
  return null
}

purify.addHook('afterSanitizeAttributes', (node) => {
  const classes = (node.getAttribute('class') ?? '').split(/\s+/)
  node.removeAttribute('class')
  const mark = markOf(node.tagName, classes)
  if (mark) node.setAttribute(MARK, mark)
  if (node.tagName === 'IMG' && !isHttpsUrl(node.getAttribute('src') ?? '')) node.setAttribute(MARK, 'drop')
  if (node.tagName === 'A') {
    const href = node.getAttribute('href')
    if (href !== null && !isWebUrl(href)) node.removeAttribute('href')
  }
})

const CONFIG = {
  ALLOWED_TAGS: TAGS,
  ALLOWED_ATTR: ATTRIBUTES,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOWED_URI_REGEXP: /^https?:/i,
  ADD_URI_SAFE_ATTR: PLAIN_VALUES,
  RETURN_DOM_FRAGMENT: true
} as const

function all(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector))
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag)
  if (className) made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

// A fold in the chat's way: a 28px row with a chevron that opens in place, the passage under a line.
function fold(label: string, passage: Node[]): HTMLDetailsElement {
  const details = element('details', 'chat-fold forum-fold')
  const summary = element('summary', 'chat-fold-header')
  const body = element('div', 'chat-fold-body')
  body.append(...passage)
  summary.append(element('span', 'chat-fold-chevron'), element('span', 'chat-fold-label', label))
  const start = excerpt(body.textContent ?? '', 48)
  if (start) summary.append(element('span', 'chat-fold-excerpt', start))
  details.append(summary, body)
  return details
}

function quoteFold(aside: Element, words: Words): HTMLDetailsElement {
  for (const title of all(aside, `[${MARK}="title"]`)) title.remove()
  const name = aside.getAttribute('data-username')
  const passage: Node[] = []
  for (const child of Array.from(aside.childNodes)) {
    if (child instanceof HTMLQuoteElement) passage.push(...Array.from(child.childNodes))
    else passage.push(child)
  }
  return fold(name ? words.quoteOf(name) : words.quote, passage)
}

// A link preview is a card of the forum's own: kept as the link it is about.
function oneboxLink(aside: Element): HTMLParagraphElement {
  const paragraph = element('p', '')
  const link = aside.querySelector('h3 a[href], header a[href], a[href]')
  const href = link?.getAttribute('href')
  if (link && href) {
    const anchor = element('a', '', (link.textContent ?? '').trim() || href)
    anchor.setAttribute('href', href)
    paragraph.append(anchor)
  }
  return paragraph
}

// The full-size picture a forum links a thumbnail to (Discourse's lightbox), for the viewer.
const FULL = 'data-full'

function picture(src: string, full: string | null): HTMLImageElement {
  const image = element('img', 'forum-image')
  if (full) image.setAttribute(FULL, full)
  image.setAttribute('referrerpolicy', 'no-referrer')
  image.decoding = 'async'
  image.src = src
  return image
}

// A picture folded to a chip until asked for: a forum's picture on screen gives the game away.
function imageChip(src: string, alt: string, words: Words, full: string | null = null): HTMLButtonElement {
  const chip = element('button', 'forum-image-chip')
  chip.type = 'button'
  chip.setAttribute('data-image-chip', src)
  if (full) chip.setAttribute(FULL, full)
  if (alt) chip.title = alt
  chip.append(element('span', 'forum-image-chip-icon'), element('span', '', words.image))
  return chip
}

export function expandImageChip(chip: Element): void {
  const src = chip.getAttribute('data-image-chip')
  if (src && isHttpsUrl(src)) chip.replaceWith(picture(src, chip.getAttribute(FULL)))
}

// An emoji that does not load is read as its name (":hugs:"); a picture, as a chip that cannot open.
export function replaceBrokenImage(image: HTMLImageElement, words: Words): void {
  if (image.classList.contains('forum-emoji')) {
    image.replaceWith(document.createTextNode(image.alt))
    return
  }
  const chip = imageChip('', image.alt, words)
  chip.disabled = true
  chip.removeAttribute('data-image-chip')
  image.replaceWith(chip)
}

function placeImage(image: HTMLImageElement, showImages: boolean, words: Words): void {
  const src = image.getAttribute('src') ?? ''
  const emoji = isEmojiImage(src, image.getAttribute(MARK) === 'emoji', sizeOf(image.getAttribute('width')), sizeOf(image.getAttribute('height')))
  image.removeAttribute(MARK)
  image.setAttribute('referrerpolicy', 'no-referrer')
  image.loading = 'lazy'
  if (emoji) {
    image.className = 'forum-emoji'
    return
  }
  const full = image.getAttribute(FULL)
  if (showImages) {
    image.replaceWith(picture(src, full))
    return
  }
  image.replaceWith(imageChip(src, image.getAttribute('alt') ?? '', words, full))
}

export function renderForumHtml(html: string, options: { showImages: boolean; words: Words }): DocumentFragment {
  const fragment = purify.sanitize(html, CONFIG)
  for (const drop of all(fragment, `[${MARK}="drop"]`)) drop.remove()
  for (const wrapper of all(fragment, `[${MARK}="lightbox"]`)) {
    const href = wrapper.getAttribute('href')
    if (href && isHttpsUrl(href)) for (const image of all(wrapper, 'img')) image.setAttribute(FULL, href)
    wrapper.replaceWith(...Array.from(wrapper.childNodes))
  }
  for (const onebox of all(fragment, `aside[${MARK}="onebox"]`)) onebox.replaceWith(oneboxLink(onebox))
  for (const quote of all(fragment, `aside[${MARK}="quote"]`)) quote.replaceWith(quoteFold(quote, options.words))
  for (const quote of all(fragment, 'blockquote')) quote.replaceWith(fold(options.words.quote, Array.from(quote.childNodes)))
  for (const details of all(fragment, 'details:not(.forum-fold)')) {
    details.className = 'chat-fold forum-fold'
    const own = details.querySelector(':scope > summary')
    const summary = own ?? element('summary', '', options.words.details)
    const label = (summary.textContent ?? '').trim() || options.words.details
    summary.className = 'chat-fold-header'
    summary.replaceChildren(element('span', 'chat-fold-chevron'), element('span', 'chat-fold-label', label))
    const body = element('div', 'chat-fold-body')
    body.append(...Array.from(details.childNodes).filter((child) => child !== summary))
    details.replaceChildren(summary, body)
  }
  for (const image of all(fragment, 'img')) {
    if (image instanceof HTMLImageElement) placeImage(image, options.showImages, options.words)
  }
  for (const marked of all(fragment, `[${MARK}]`)) marked.removeAttribute(MARK)
  for (const paragraph of all(fragment, 'p')) {
    if ((paragraph.textContent ?? '').trim() === '' && !paragraph.querySelector('img, button')) paragraph.remove()
  }
  return fragment
}
