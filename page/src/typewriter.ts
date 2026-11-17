// Writes a reply out as if it were being typed. The HTML was parsed once and is all in place: each
// frame only lengthens text nodes and unhides what the writing has reached, so nothing is parsed
// again. Returns a function that ends it at once, with everything shown.

const HIDDEN = 'data-unwritten'
// What appears whole rather than letter by letter.
const ATOMS = new Set(['IMG', 'BR', 'HR', 'DETAILS', 'BUTTON', 'TABLE'])
// Every reply is written in about this many frames, short or long.
const FRAMES = 12

type Unit = { kind: 'text'; node: Text; text: string } | { kind: 'atom'; element: Element }

export function typeOut(root: HTMLElement, done: () => void): () => void {
  const units: Unit[] = []
  const hidden: Element[] = []
  const collect = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child instanceof Text) {
        if (child.data.trim() === '') continue
        units.push({ kind: 'text', node: child, text: child.data })
        child.data = ''
      } else if (child instanceof Element) {
        child.setAttribute(HIDDEN, '')
        hidden.push(child)
        if (ATOMS.has(child.tagName)) units.push({ kind: 'atom', element: child })
        else collect(child)
      }
    }
  }
  collect(root)

  const caret = document.createElement('span')
  caret.className = 'chat-caret'
  caret.setAttribute('aria-hidden', 'true')
  caret.textContent = '▍'

  const reveal = (from: Element | null) => {
    for (let at = from; at && at !== root; at = at.parentElement) at.removeAttribute(HIDDEN)
  }

  const total = units.reduce((sum, unit) => sum + (unit.kind === 'text' ? unit.text.length : 8), 0)
  const perFrame = Math.max(4, Math.ceil(total / FRAMES))
  let index = 0
  let written = 0
  let frame = 0

  const finish = () => {
    cancelAnimationFrame(frame)
    for (const unit of units) if (unit.kind === 'text') unit.node.data = unit.text
    for (const element of hidden) element.removeAttribute(HIDDEN)
    caret.remove()
  }

  const step = () => {
    let budget = perFrame
    while (budget > 0 && index < units.length) {
      const unit = units[index]
      if (!unit) break
      if (unit.kind === 'atom') {
        reveal(unit.element)
        unit.element.after(caret)
        budget -= 8
        index++
        continue
      }
      reveal(unit.node.parentElement)
      const take = Math.min(budget, unit.text.length - written)
      written += take
      budget -= take
      unit.node.data = unit.text.slice(0, written)
      unit.node.after(caret)
      if (written >= unit.text.length) {
        index++
        written = 0
      }
    }
    if (index >= units.length) {
      finish()
      done()
      return
    }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return finish
}
