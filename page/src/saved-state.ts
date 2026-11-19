import { ReplyTarget, type CommunityId } from '../../src/community'

export type Draft = { text: string; target: ReplyTarget | null; uncertain: boolean }
export type ReadingPosition = { floor: number; page: number; offset: number }

// What the page keeps between visits, through the host (JSON, 32 KiB at most). What comes back is
// whatever was stored, perhaps by an older page: each field is checked and falls back on its own.
export type SavedState = {
  community: CommunityId
  // null: the community's first channel.
  channel: string | null
  // Replies appear one after another when a thread opens.
  stream: boolean
  // Pictures shown as they are, rather than folded to a chip.
  images: boolean
  disguiseAvatars: boolean
  // "<community>:<topic id>" -> the highest floor seen, oldest first.
  read: Record<string, number>
  drafts: Record<string, Draft>
  positions: Record<string, ReadingPosition>
}

export const READ_LIMIT = 200

export const defaultState: SavedState = { community: 'linuxdo', channel: null, stream: true, images: false, disguiseAvatars: false, read: {}, drafts: {}, positions: {} }

export function isCommunityId(value: unknown): value is CommunityId {
  return value === 'linuxdo' || value === 'v2ex'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const READ_KEY = /^(linuxdo|v2ex):\d{1,12}$/

export function readKey(community: CommunityId, id: string): string {
  return `${community}:${id}`
}

// The account is escaped, so neither colons nor another account can share its drafts.
export function scopeKey(community: CommunityId, account: string | null, id: string): string {
  return `${community}:${account === null ? '' : encodeURIComponent(account)}:${id}`
}
const SCOPED_KEY = /^(linuxdo|v2ex):[^:]{0,900}:\d{1,12}$/
const encoder = new TextEncoder()
export const STATE_BYTES = 32 * 1024

// Reading history can expire to make room; a draft is never silently shortened or evicted.
export function fitSavedState(state: SavedState): SavedState | null {
  const saved = { ...state, read: { ...state.read }, positions: { ...state.positions } }
  const fits = () => encoder.encode(JSON.stringify(saved)).length <= STATE_BYTES
  for (const field of [saved.read, saved.positions]) {
    for (const key of Object.keys(field)) {
      if (fits()) return saved
      delete field[key]
    }
  }
  return fits() ? saved : null
}

export function readSavedState(value: unknown): SavedState {
  if (!isRecord(value)) return { ...defaultState, read: {} }
  const channel = value.channel
  const read: Record<string, number> = {}
  if (isRecord(value.read)) {
    const entries = Object.entries(value.read).filter((entry): entry is [string, number] => {
      const [key, floor] = entry
      return READ_KEY.test(key) && typeof floor === 'number' && Number.isInteger(floor) && floor >= 0 && floor <= 1_000_000
    })
    for (const [key, floor] of entries.slice(-READ_LIMIT)) read[key] = floor
  }
  const drafts: Record<string, Draft> = {}
  if (isRecord(value.drafts)) for (const [key, draft] of Object.entries(value.drafts)) {
    if (!SCOPED_KEY.test(key) || key.split(':')[1] === '' || !isRecord(draft) || typeof draft.text !== 'string' || draft.text.length > 8000) continue
    const target = ReplyTarget.safeParse(draft.target)
    if (draft.target !== null && !target.success) continue
    if (draft.text || target.success || draft.uncertain === true) drafts[key] = { text: draft.text, target: target.success ? target.data : null, uncertain: draft.uncertain === true }
  }
  const positions: Record<string, ReadingPosition> = {}
  if (isRecord(value.positions)) for (const [key, position] of Object.entries(value.positions).slice(-READ_LIMIT)) {
    if (!SCOPED_KEY.test(key) || !isRecord(position)) continue
    const { floor, page, offset } = position
    if (typeof floor === 'number' && Number.isInteger(floor) && floor >= 0 && floor <= 1_000_000
      && typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= 1000
      && typeof offset === 'number' && Number.isFinite(offset) && Math.abs(offset) <= 1_000_000) positions[key] = { floor, page, offset }
  }
  return {
    community: isCommunityId(value.community) ? value.community : defaultState.community,
    channel: typeof channel === 'string' && channel.length > 0 && channel.length <= 64 ? channel : null,
    stream: typeof value.stream === 'boolean' ? value.stream : defaultState.stream,
    images: typeof value.images === 'boolean' ? value.images : defaultState.images,
    disguiseAvatars: typeof value.disguiseAvatars === 'boolean' ? value.disguiseAvatars : defaultState.disguiseAvatars,
    read, drafts, positions
  }
}

// Seen up to a floor: the topic moves to the newest end, and past the limit the oldest are let go.
export function markRead(state: SavedState, key: string, floor: number): SavedState {
  const before = state.read[key]
  const highest = before === undefined ? floor : Math.max(before, floor)
  const entries = Object.entries(state.read).filter(([other]) => other !== key)
  entries.push([key, highest])
  return { ...state, read: Object.fromEntries(entries.slice(-READ_LIMIT)) }
}

export function savePosition(state: SavedState, key: string, position: ReadingPosition): SavedState {
  const old = state.positions[key]
  if (old?.floor === position.floor && old.page === position.page && old.offset === position.offset) return state
  const entries = Object.entries(state.positions).filter(([other]) => other !== key)
  entries.push([key, position])
  return { ...state, positions: Object.fromEntries(entries.slice(-READ_LIMIT)) }
}
