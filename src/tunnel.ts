import { connect as connectTcp } from 'node:net'
import type { Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'

// A connection to a host through an HTTP proxy: the proxy is asked to CONNECT, and from its 200 on
// the socket carries whatever the two ends say, here TLS and HTTP/2.

const MAX_REPLY = 16 * 1024

export function tunnel(proxy: URL, host: string, port: number, signal: AbortSignal): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = proxy.protocol === 'https:'
      ? connectTls({ host: proxy.hostname, port: Number(proxy.port || 443), servername: proxy.hostname })
      : connectTcp({ host: proxy.hostname, port: Number(proxy.port || 80) })
    let reply = Buffer.alloc(0)
    let settled = false
    const end = (error: Error | null) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
      if (error) { socket.destroy(); reject(error) } else resolve(socket)
    }
    const onAbort = () => end(new Error('已取消'))
    const onError = () => end(new Error('连不上代理'))
    const onClose = () => end(new Error('代理断开了连接'))
    const onData = (chunk: Buffer) => {
      reply = Buffer.concat([reply, chunk])
      const head = reply.indexOf('\r\n\r\n')
      if (head < 0) {
        if (reply.length > MAX_REPLY) end(new Error('代理的回应读不懂'))
        return
      }
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(reply.subarray(0, head).toString('latin1'))?.[1]
      if (status !== '200') {
        end(new Error(status === '407' ? '代理需要登录' : status ? `代理拒绝了连接（${status}）` : '代理的回应读不懂'))
        return
      }
      // What the far end already sent belongs to whoever reads the socket next.
      const rest = reply.subarray(head + 4)
      socket.pause()
      if (rest.length > 0) socket.unshift(rest)
      end(null)
    }
    if (signal.aborted) { end(new Error('已取消')); return }
    signal.addEventListener('abort', onAbort)
    // Kept for the socket's whole life: an error between this hand and the next must not go unheard.
    socket.on('error', () => {})
    socket.on('error', onError)
    socket.on('close', onClose)
    socket.on('data', onData)
    socket.once(proxy.protocol === 'https:' ? 'secureConnect' : 'connect', () => {
      const authority = `${host}:${port}`
      const login = proxy.username ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}\r\n` : ''
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${login}\r\n`)
    })
  })
}

// TLS over a tunnel, settled on HTTP/2 with the far end: what Cloudflare lets through.
export function secured(socket: Socket, host: string, signal: AbortSignal): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const tls = connectTls({ socket, servername: host, ALPNProtocols: ['h2'] })
    let settled = false
    const end = (error: Error | null) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      tls.off('error', onError)
      if (error) { tls.destroy(); reject(error) } else resolve(tls)
    }
    const onAbort = () => end(new Error('已取消'))
    const onError = () => end(new Error('网络错误'))
    if (signal.aborted) { end(new Error('已取消')); return }
    signal.addEventListener('abort', onAbort)
    tls.on('error', onError)
    tls.once('secureConnect', () => end(tls.alpnProtocol === 'h2' ? null : new Error('对方不支持 HTTP/2')))
  })
}
