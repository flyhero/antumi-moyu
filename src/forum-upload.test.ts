import { describe, expect, it, vi } from 'vitest'
import type { PluginBrowserRequest, PluginBrowserResponse, PluginPageContext } from '@antumi/plugin-sdk'
import { uploadOutcome } from './forum-upload.js'

const response = (body: string, status = 200): PluginBrowserResponse => ({ status, body, headers: {} })
function harness(responses: PluginBrowserResponse[]) {
  const requests: PluginBrowserRequest[] = []
  const context: PluginPageContext = {
    signal: new AbortController().signal,
    browser: vi.fn(async (request) => {
      requests.push(request)
      const next = responses.shift()
      if (!next) throw new Error('unexpected request')
      return { connected: true, response: next }
    })
  }
  return { context, requests }
}
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
const picture = { name: 'shot [1].png', type: 'image/png', data: png.toString('base64') }

describe('uploading a picture to linux.do', () => {
  it('posts the bytes as the composer does and returns the markdown for the draft', async () => {
    const h = harness([response('{"csrf":"fresh"}'), response('{"short_url":"upload://abc123.png","width":640,"height":480,"url":"/uploads/x.png"}')])
    expect(await uploadOutcome('linuxdo', picture, h.context)).toEqual({ state: 'done', markdown: '![shot 1|640x480](upload://abc123.png)' })
    const post = h.requests.at(-1)
    if (post?.action !== 'request') throw new Error('missing upload')
    expect(post).toMatchObject({ path: '/uploads.json', method: 'POST', bodyEncoding: 'base64', headers: { 'x-csrf-token': 'fresh' } })
    const boundary = /boundary=(\S+)/.exec(post.headers?.['content-type'] ?? '')?.[1] ?? ''
    const body = Buffer.from(post.body ?? '', 'base64')
    expect(body.includes(png)).toBe(true)
    const text = body.toString('latin1')
    expect(text).toContain(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ncomposer\r\n`)
    expect(text).toContain('name="synchronous"\r\n\r\ntrue')
    expect(text).toContain('name="file"; filename="shot [1].png"\r\nContent-Type: image/png')
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })

  it('shows what linux.do says when it refuses, and a rate limit as one', async () => {
    const refused = harness([response('{"csrf":"c"}'), response('{"errors":["不允许上传此类文件"]}', 422)])
    expect(await uploadOutcome('linuxdo', picture, refused.context)).toEqual({ state: 'failed', failure: { kind: 'rejected', message: '不允许上传此类文件' } })
    const limited = harness([response('{"csrf":"c"}'), response('{"errors":["上传太频繁"]}', 429)])
    expect(await uploadOutcome('linuxdo', picture, limited.context)).toMatchObject({ state: 'failed', failure: { kind: 'rate-limit' } })
  })

  it('takes pictures alone, and nothing for V2EX', async () => {
    const h = harness([])
    expect(await uploadOutcome('linuxdo', { ...picture, type: 'application/pdf' }, h.context)).toMatchObject({ state: 'failed' })
    expect(await uploadOutcome('v2ex', picture, h.context)).toMatchObject({ state: 'failed' })
    expect(h.requests).toHaveLength(0)
  })
})
