import type { CommunityId } from '../../src/community'

// Frozen v1 slots: new host agents must not change existing users' avatars.
const AGENTS = ['claude', 'codex', 'cursor', 'opencode', 'pi', 'dsh', 'antigravity', 'zcode', 'kimi', 'gemini'] as const
export type AvatarAgent = typeof AGENTS[number]

export function avatarDisguise(community: CommunityId, name: string) {
  const key = `${community}\0${name.trim().normalize('NFC').toLowerCase()}`
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0
  }
  return { agent: AGENTS[hash % AGENTS.length] ?? 'claude', tone: Math.floor(hash / AGENTS.length) % 3 }
}
