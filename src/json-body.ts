// A forum may answer with something that is not JSON (a proxy's HTML page); that is a message, not a stack.
export function parseJson(body: string, forum: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`${forum} 返回的内容读不懂`)
  }
}
