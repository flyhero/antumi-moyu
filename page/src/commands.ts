import type { Channel, CommunityId } from '../../src/community'

// The composer is a command line: it never posts anything, it only steers the reader.
export type Command =
  | { kind: 'none' }
  | { kind: 'next' }
  | { kind: 'refresh' }
  | { kind: 'open' }
  | { kind: 'leave' }
  | { kind: 'help' }
  | { kind: 'unknown'; text: string }
  | { kind: 'community'; community: CommunityId }
  | { kind: 'channel'; name: string }
  | { kind: 'floor'; floor: number }

const WORDS: Record<string, Command> = {
  n: { kind: 'next' },
  next: { kind: 'next' },
  r: { kind: 'refresh' },
  refresh: { kind: 'refresh' },
  o: { kind: 'open' },
  open: { kind: 'open' },
  q: { kind: 'leave' },
  quit: { kind: 'leave' },
  '?': { kind: 'help' },
  h: { kind: 'help' },
  help: { kind: 'help' }
}

const COMMUNITIES: Record<string, CommunityId> = { linuxdo: 'linuxdo', 'linux.do': 'linuxdo', ld: 'linuxdo', v2ex: 'v2ex', v2: 'v2ex' }

export function parseCommand(input: string): Command {
  const text = input.trim()
  if (text === '') return { kind: 'none' }
  const word = text.toLowerCase()
  const known = Object.hasOwn(WORDS, word) ? WORDS[word] : undefined
  if (known) return known
  const floor = /^#?(\d{1,6})$/.exec(text)?.[1]
  if (floor !== undefined) return { kind: 'floor', floor: Number(floor) }
  if (text.startsWith('/') && text.length > 1 && !/\s/.test(text)) {
    const name = text.slice(1)
    const lower = name.toLowerCase()
    if (lower === 'help' || lower === '?') return { kind: 'help' }
    const community = Object.hasOwn(COMMUNITIES, lower) ? COMMUNITIES[lower] : undefined
    if (community) return { kind: 'community', community }
    return { kind: 'channel', name }
  }
  return { kind: 'unknown', text }
}

// A channel by its id or by the name the forum gives it, either case.
export function findChannel(channels: readonly Channel[], name: string): Channel | null {
  const wanted = name.trim().toLowerCase()
  return channels.find((channel) => channel.id.toLowerCase() === wanted)
    ?? channels.find((channel) => channel.name.toLowerCase() === wanted)
    ?? null
}
