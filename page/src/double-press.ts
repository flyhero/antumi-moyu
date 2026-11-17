// The boss key: a key pressed twice within a moment. Returns a function to call on each press,
// true when that press is the second.
export function doublePress(within: number, now: () => number = Date.now): () => boolean {
  let last = -Infinity
  return () => {
    const at = now()
    if (at - last <= within) {
      last = -Infinity
      return true
    }
    last = at
    return false
  }
}
