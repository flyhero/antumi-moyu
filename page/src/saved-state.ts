import type { CommunityId } from '../../src/community'

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
  // "<community>:<topic id>" -> the highest floor seen, oldest first.
  read: Record<string, number>
}

export const READ_LIMIT = 200

export const defaultState: SavedState = { community: 'linuxdo', channel: null, stream: true, images: false, read: {} }

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
  return {
    community: isCommunityId(value.community) ? value.community : defaultState.community,
    channel: typeof channel === 'string' && channel.length > 0 && channel.length <= 64 ? channel : null,
    stream: typeof value.stream === 'boolean' ? value.stream : defaultState.stream,
    images: typeof value.images === 'boolean' ? value.images : defaultState.images,
    read
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
