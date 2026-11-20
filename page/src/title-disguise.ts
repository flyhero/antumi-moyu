// A stand-in chat title for one topic. The topic keeps a sentence until that sentence is removed;
// editing its words keeps the same topics on it. Built-in ids are frozen: do not reorder or reuse one.

export const TITLE_LIMIT = 40
export const TITLE_CHARS = 40

export type TitleCover = { id: string; text: string }

const ZH_OBJECTS = ['侧栏宽度', '类型报错', '这次发布', '登录失败', '列表滚动', '提交说明', '失败的测试', '草稿保存', '通知角标', '分支切换', '会话标题', '插件页面', '阅读位置', '折叠的图片', '快捷键', '构建脚本']
const EN_OBJECTS = ['sidebar width', 'type error', 'release', 'sign-in failure', 'list scrolling', 'commit note', 'failing test', 'draft saving', 'badge count', 'branch switch', 'chat title', 'plugin page', 'reading place', 'folded pictures', 'shortcut', 'build script']

const ZH_FRAMES = [
  (text: string) => `看一下${text}`,
  (text: string) => `把${text}收一收`,
  (text: string) => `${text}对不上`,
  (text: string) => `接着处理${text}`,
  (text: string) => `${text}先放一放`,
  (text: string) => `核一下${text}`,
  (text: string) => `${text}还差一截`,
  (text: string) => `整理一下${text}`,
  (text: string) => `${text}再过一遍`,
  (text: string) => `补一下${text}`,
  (text: string) => `${text}这边看一下`,
  (text: string) => `改一下${text}`
]
const EN_FRAMES = [
  (text: string) => `Check the ${text}`,
  (text: string) => `Look at the ${text}`,
  (text: string) => `Sort out the ${text}`,
  (text: string) => `Come back to the ${text}`,
  (text: string) => `Leave the ${text}`,
  (text: string) => `Note the ${text}`,
  (text: string) => `Revisit the ${text}`,
  (text: string) => `Fix the ${text}`,
  (text: string) => `Trim the ${text}`,
  (text: string) => `Review the ${text}`,
  (text: string) => `Hold the ${text}`,
  (text: string) => `Update the ${text}`
]

function builtin(prefix: string, frames: readonly ((text: string) => string)[], objects: readonly string[]): TitleCover[] {
  return frames.flatMap((frame, frameIndex) => objects.map((object, objectIndex) => ({ id: `${prefix}:${frameIndex}:${objectIndex}`, text: frame(object) })))
}

const BUILTIN = {
  'zh-CN': builtin('zh', ZH_FRAMES, ZH_OBJECTS),
  en: builtin('en', EN_FRAMES, EN_OBJECTS)
} as const

export function builtinCovers(locale: 'zh-CN' | 'en'): readonly TitleCover[] {
  return BUILTIN[locale]
}

// An empty custom list means the built-in sentences. Any sentence of the user's replaces them.
export function coversFor(locale: 'zh-CN' | 'en', custom: readonly TitleCover[]): readonly TitleCover[] {
  return custom.length > 0 ? custom : builtinCovers(locale)
}

function hash(key: string): number {
  let value = 2166136261
  for (let index = 0; index < key.length; index += 1) value = Math.imul(value ^ key.charCodeAt(index), 16777619) >>> 0
  return value
}

// Highest score wins, so adding or removing one sentence only moves the topics that pick it.
export function coverFor(topicKey: string, covers: readonly TitleCover[]): string | null {
  let best: TitleCover | null = null
  let bestScore = 0
  for (const cover of covers) {
    const score = hash(`${topicKey}\0${cover.id}`)
    if (!best || score > bestScore || (score === bestScore && cover.id < best.id)) {
      best = cover
      bestScore = score
    }
  }
  return best?.text ?? null
}

const TITLE_ID = /^u[1-9]\d{0,5}$/

export function readTitleCovers(value: unknown): TitleCover[] {
  if (!Array.isArray(value)) return []
  const covers: TitleCover[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (covers.length >= TITLE_LIMIT) break
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const { id, text } = item as { id?: unknown; text?: unknown }
    if (typeof id !== 'string' || !TITLE_ID.test(id) || seen.has(id) || typeof text !== 'string') continue
    const trimmed = text.trim().slice(0, TITLE_CHARS)
    if (!trimmed) continue
    seen.add(id)
    covers.push({ id, text: trimmed })
  }
  return covers
}

export function sameTitleCovers(left: readonly TitleCover[], right: readonly TitleCover[]): boolean {
  return left.length === right.length && left.every((cover, index) => cover.id === right[index]?.id && cover.text === right[index]?.text)
}

function titleLines(text: string): string[] {
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().slice(0, TITLE_CHARS)
    if (!line) continue
    lines.push(line)
    if (lines.length >= TITLE_LIMIT) break
  }
  return lines
}

function maxTitleId(covers: readonly TitleCover[]): number {
  let max = 0
  for (const cover of covers) {
    const id = Number(cover.id.slice(1))
    if (Number.isInteger(id) && id > max) max = id
  }
  return max
}

// Lines that still read the same keep their id. A changed line takes the next unmatched id, in
// order, so it stays the sentence those topics were showing. Only a line that is gone moves them.
export function reconcileTitles(previous: readonly TitleCover[], text: string): TitleCover[] {
  const lines = titleLines(text)
  const unused = [...previous]
  const slots: Array<TitleCover | null> = []
  for (const line of lines) {
    const at = unused.findIndex((cover) => cover.text === line)
    slots.push(at < 0 ? null : unused.splice(at, 1)[0] ?? null)
  }
  let seq = maxTitleId(previous)
  return slots.map((cover, index) => {
    const line = lines[index] ?? ''
    if (cover) return cover
    const edited = unused.shift()
    if (edited) return { id: edited.id, text: line }
    seq += 1
    return { id: `u${seq}`, text: line }
  })
}
