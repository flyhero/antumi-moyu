import { connect } from 'node:http2'
import type { ClientHttp2Session, IncomingHttpHeaders } from 'node:http2'
import pkg from '../package.json' with { type: 'json' }

// linux.do's Cloudflare answers HTTP/1.1 clients (fetch, node:https) with a challenge but lets HTTP/2
// through, so every request goes out over node:http2.

export type HttpResponse = { status: number; headers: Record<string, string>; body: string }
export type GetOptions = { timeoutMs?: number; maxBytes?: number }
export type Get = (url: string, signal: AbortSignal, options?: GetOptions) => Promise<HttpResponse>

const TIMEOUT_MS = 15_000
const MAX_BYTES = 4 * 1024 * 1024
const USER_AGENT = `antumi-moyu/${pkg.version} (+https://github.com/flyhero/antumi-moyu)`

// Plain http is for tests against a local server only.
function parseTarget(url: string): URL {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw new Error('网址不对')
  }
  const local = target.protocol === 'http:' && target.hostname === '127.0.0.1'
  if (target.protocol !== 'https:' && !local) throw new Error('只允许用 https 访问')
  return target
}

function plainHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith(':') || value === undefined) continue
    out[name] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

export const get: Get = (url, signal, options = {}) =>
  new Promise<HttpResponse>((resolve, reject) => {
    const target = parseTarget(url)
    const maxBytes = options.maxBytes ?? MAX_BYTES
    const stop = AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)])
    // Told apart by who aborted: the caller's signal means they gave up, anything else is our timer.
    const abortError = () => new Error(signal.aborted ? '已取消' : '超时')
    if (stop.aborted) {
      reject(abortError())
      return
    }

    let session: ClientHttp2Session | undefined
    let settled = false
    const onAbort = () => end(abortError())
    // The one exit: whichever path gets here first wins, and the session is always torn down.
    const end = (error: Error | null, response?: HttpResponse) => {
      if (settled) return
      settled = true
      stop.removeEventListener('abort', onAbort)
      session?.destroy()
      if (response) resolve(response)
      else reject(error ?? new Error('网络错误'))
    }
    stop.addEventListener('abort', onAbort)

    session = connect(target.origin)
    session.on('error', () => end(new Error('网络错误')))
    const stream = session.request({ ':method': 'GET', ':path': target.pathname + target.search, 'user-agent': USER_AGENT, accept: '*/*' }, { endStream: true })

    let status = 0
    let headers: Record<string, string> = {}
    const chunks: Buffer[] = []
    let size = 0
    stream.on('response', (received) => {
      status = Number(received[':status'])
      headers = plainHeaders(received)
      if (Number(headers['content-length']) > maxBytes) end(new Error('响应太大'))
    })
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) end(new Error('响应太大'))
      else chunks.push(chunk)
    })
    stream.on('end', () => end(null, { status, headers, body: Buffer.concat(chunks).toString('utf8') }))
    stream.on('error', () => end(new Error('网络错误')))
    // A stream closed before its end (reset, GOAWAY) is a broken response.
    stream.on('close', () => end(new Error('网络错误')))
  })
