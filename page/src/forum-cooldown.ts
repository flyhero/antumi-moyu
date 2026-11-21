// After linux.do refuses a request, quiet background work (session focus checks, list refresh,
// notification polls) waits out the same cooldown so they do not keep burning the allowance.

const DEFAULT_MS = 60_000
let until = 0

export function clearForumCooldown(): void {
  until = 0
}

export function noteForumRefusal(message: string, now = Date.now()): void {
  const match = /请 (\d+) 秒后再试/.exec(message)
  if (match) {
    until = Math.max(until, now + Number(match[1]) * 1000)
    return
  }
  if (/请求过于频繁|暂时拦住了/.test(message)) until = Math.max(until, now + DEFAULT_MS)
}

export function forumCooldownRemaining(now = Date.now()): number {
  return Math.max(0, until - now)
}

export function forumCoolingDown(now = Date.now()): boolean {
  return forumCooldownRemaining(now) > 0
}
