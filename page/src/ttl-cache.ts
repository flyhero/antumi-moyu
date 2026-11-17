// What the forums answered, kept a few minutes so going back and forth asks them nothing new. Bounded,
// so a long session does not hold every page it ever read.
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; at: number }>()
  private readonly ttl: number
  private readonly limit: number
  private readonly now: () => number

  constructor(ttl: number, options: { limit?: number; now?: () => number } = {}) {
    this.ttl = ttl
    this.limit = options.limit ?? 100
    this.now = options.now ?? Date.now
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now() - entry.at >= this.ttl) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, { value, at: this.now() })
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break
      this.entries.delete(oldest)
    }
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}
