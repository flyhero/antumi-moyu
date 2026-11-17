import { createServer } from 'node:http2'
import type { Http2Server, Http2ServerRequest, Http2ServerResponse, ServerHttp2Session } from 'node:http2'
import { createServer as createTcpServer, connect as connectTcp } from 'node:net'
import type { Server, Socket } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get } from './http.js'

let server: Http2Server
let base = ''
const sessions = new Set<ServerHttp2Session>()
let unanswered = 0

function handle(request: Http2ServerRequest, response: Http2ServerResponse): void {
  const path = request.url
  if (path === '/ok') {
    response.writeHead(200, { 'content-type': 'text/plain', 'x-seen': 'yes' })
    response.end(JSON.stringify({ method: request.method, userAgent: request.headers['user-agent'], accept: request.headers.accept }))
  } else if (path === '/query?x=1') {
    response.end('with query')
  } else if (path === '/big') {
    response.writeHead(200)
    response.write(Buffer.alloc(2048))
    response.end(Buffer.alloc(2048))
  } else if (path === '/redirect') {
    response.writeHead(302, { location: '/ok' })
    response.end()
  } else if (path === '/missing') {
    response.writeHead(404)
    response.end('nope')
  } else if (path === '/reset') {
    response.stream.close(2)
  } else {
    // Never answered: for timeout and abort.
    unanswered++
  }
}

beforeAll(async () => {
  server = createServer(handle)
  server.on('session', (session) => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  for (const session of sessions) session.destroy()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const never = new AbortController().signal

describe('get', () => {
  it('returns status, lowercase headers and the body, as a plain GET with our headers', async () => {
    const response = await get(`${base}/ok`, never)
    expect(response.status).toBe(200)
    expect(response.headers['x-seen']).toBe('yes')
    const seen: unknown = JSON.parse(response.body)
    expect(seen).toEqual({ method: 'GET', userAgent: expect.stringMatching(/^antumi-moyu\/\d+\.\d+\.\d+\S* \(\+https:\/\/github\.com\/flyhero\/antumi-moyu\)$/), accept: '*/*' })
  })

  it('sends the query string', async () => {
    expect((await get(`${base}/query?x=1`, never)).body).toBe('with query')
  })

  it('returns a non-200 as it is', async () => {
    const response = await get(`${base}/missing`, never)
    expect(response).toMatchObject({ status: 404, body: 'nope' })
  })

  it('does not follow a redirect', async () => {
    const response = await get(`${base}/redirect`, never)
    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/ok')
  })

  it('refuses a body over the cap', async () => {
    await expect(get(`${base}/big`, never, { maxBytes: 1000 })).rejects.toThrow('响应太大')
    expect((await get(`${base}/big`, never, { maxBytes: 5000 })).body).toHaveLength(4096)
  })

  it('times out', async () => {
    await expect(get(`${base}/hang`, never, { timeoutMs: 60 })).rejects.toThrow('超时')
  })

  it('stops when the caller aborts, and not before it is called', async () => {
    const controller = new AbortController()
    const pending = get(`${base}/hang`, controller.signal)
    setTimeout(() => controller.abort(), 30)
    await expect(pending).rejects.toThrow('已取消')

    const before = unanswered
    await expect(get(`${base}/hang`, AbortSignal.abort())).rejects.toThrow('已取消')
    expect(unanswered).toBe(before)
  })

  it('reports a reset stream and a refused connection as a network error', async () => {
    await expect(get(`${base}/reset`, never)).rejects.toThrow('网络错误')
    await expect(get('http://127.0.0.1:1/', never)).rejects.toThrow('网络错误')
  })

  it('refuses anything but https, except the local test server', async () => {
    await expect(get('http://example.com/', never)).rejects.toThrow('只允许用 https 访问')
    await expect(get('http://localhost:1/', never)).rejects.toThrow('只允许用 https 访问')
    await expect(get('ftp://example.com/', never)).rejects.toThrow('只允许用 https 访问')
    await expect(get('not a url', never)).rejects.toThrow('网址不对')
  })

  it('closes the session on every path', async () => {
    await get(`${base}/ok`, never)
    await get(`${base}/big`, never, { maxBytes: 10 }).catch(() => undefined)
    await get(`${base}/hang`, never, { timeoutMs: 30 }).catch(() => undefined)
    await expect.poll(() => sessions.size).toBe(0)
  })
})

// An HTTP proxy that answers CONNECT: it tunnels to the host asked for, or refuses as it is told to.
describe('get through a proxy', () => {
  let proxy: Server
  let address = ''
  let refuse: string | null = null
  const asked: string[] = []
  const open = new Set<Socket>()

  beforeAll(async () => {
    proxy = createTcpServer((client) => {
      open.add(client)
      client.on('close', () => open.delete(client))
      client.on('error', () => {})
      let head = ''
      const onData = (chunk: Buffer) => {
        head += chunk.toString('latin1')
        if (!head.includes('\r\n\r\n')) return
        client.off('data', onData)
        asked.push(head)
        const [, host, port] = /^CONNECT ([^:\s]+):(\d+) HTTP\/1\.1/.exec(head) ?? []
        if (refuse !== null || !host || !port) { client.end(refuse ?? 'HTTP/1.1 400 Bad Request\r\n\r\n'); return }
        const upstream = connectTcp({ host, port: Number(port) }, () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          client.pipe(upstream)
          upstream.pipe(client)
        })
        open.add(upstream)
        upstream.on('close', () => { open.delete(upstream); client.destroy() })
        upstream.on('error', () => client.destroy())
        client.on('close', () => upstream.destroy())
      }
      client.on('data', onData)
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const bound = proxy.address()
    if (!bound || typeof bound === 'string') throw new Error('no port')
    address = `127.0.0.1:${bound.port}`
  })

  afterAll(async () => {
    for (const socket of open) socket.destroy()
    await new Promise<void>((resolve) => proxy.close(() => resolve()))
  })

  it('asks the proxy for a tunnel and speaks HTTP/2 through it', async () => {
    asked.length = 0
    refuse = null
    const response = await get(`${base}/ok`, never, { proxy: `http://${address}` })
    expect(response.status).toBe(200)
    expect(response.headers['x-seen']).toBe('yes')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatch(new RegExp(`^CONNECT ${base.replace('http://', '')} HTTP/1\\.1\\r\\nHost: ${base.replace('http://', '')}\\r\\n\\r\\n$`))
  })

  it('signs in to a proxy that names a user', async () => {
    asked.length = 0
    refuse = null
    await get(`${base}/ok`, never, { proxy: `http://me:p%40ss@${address}` })
    expect(asked[0]).toContain(`Proxy-Authorization: Basic ${Buffer.from('me:p@ss').toString('base64')}\r\n`)
  })

  it('goes direct when told there is no proxy', async () => {
    asked.length = 0
    expect((await get(`${base}/ok`, never, { proxy: null })).status).toBe(200)
    expect(asked).toHaveLength(0)
  })

  it('says what the proxy refused', async () => {
    refuse = 'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'
    await expect(get(`${base}/ok`, never, { proxy: `http://${address}` })).rejects.toThrow('代理需要登录')
    refuse = 'HTTP/1.1 403 Forbidden\r\n\r\n'
    await expect(get(`${base}/ok`, never, { proxy: `http://${address}` })).rejects.toThrow('代理拒绝了连接（403）')
    refuse = ''
    await expect(get(`${base}/ok`, never, { proxy: `http://${address}` })).rejects.toThrow('代理断开了连接')
    refuse = null
  })

  it('reports a proxy that is not there, and gives up at the timeout', async () => {
    await expect(get(`${base}/ok`, never, { proxy: 'http://127.0.0.1:1' })).rejects.toThrow('连不上代理')
    await expect(get(`${base}/never`, never, { proxy: `http://${address}`, timeoutMs: 150 })).rejects.toThrow('超时')
  })

  it('leaves nothing open behind it', async () => {
    refuse = null
    await get(`${base}/ok`, never, { proxy: `http://${address}` })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(open.size).toBe(0)
  })
})

