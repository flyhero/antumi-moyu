// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connect } from '@antumi/plugin-sdk/page'
import { preparePicture, base64Of, UPLOAD_LIMIT } from './picture-upload'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

// Exercise the installed SDK, rather than the preview host: the SDK's packaged page entry once
// still enforced 64 KiB even though the host and source bridge already allowed image uploads.
async function bridge() {
  vi.useFakeTimers()
  location.hash = '#upload-bridge'
  const sent = vi.spyOn(parent, 'postMessage').mockImplementation(() => {})
  const receive = (message: Record<string, unknown>) => window.dispatchEvent(new MessageEvent('message', {
    source: parent, data: { antumiPluginPage: 'upload-bridge', ...message }
  }))
  const ready = connect()
  receive({ kind: 'init', theme: { scheme: 'light', variables: {} }, locale: 'zh-CN', state: null })
  const host = await ready
  return { host, sent, receive }
}

describe('packaged upload bridge', () => {
  it('passes a pasted image larger than 64 KiB to the backend and receives its markdown', async () => {
    const f = await bridge()
    const image = new File([new Uint8Array(128 * 1024)], 'pasted.png', { type: 'image/png' })
    const upload = await preparePicture(image)
    const result = f.host.call('upload', upload).then((value) => ({ value }), (error: unknown) => ({ error }))
    const call = f.sent.mock.calls.at(-1)?.[0]
    expect(call).toMatchObject({ kind: 'call', method: 'upload' })
    expect(call.params.data.length).toBeGreaterThan(65536)
    f.receive({ kind: 'response', id: call.id, result: { state: 'done', markdown: '![pasted](upload://pasted.png)' } })
    await expect(result).resolves.toEqual({ value: { state: 'done', markdown: '![pasted](upload://pasted.png)' } })
  })

  it('allows a 2 MiB image in base64 while keeping the 3 MiB call and 32 KiB state limits', async () => {
    const f = await bridge()
    const data = await base64Of(new Blob([new Uint8Array(UPLOAD_LIMIT)]))
    const result = f.host.call('upload', { name: 'image.jpg', type: 'image/jpeg', data }).then((value) => ({ value }), (error: unknown) => ({ error }))
    const call = f.sent.mock.calls.at(-1)?.[0]
    expect(call).toMatchObject({ kind: 'call', method: 'upload' })
    expect(call.params.data.length).toBe(data.length)
    f.receive({ kind: 'response', id: call.id, result: { state: 'done', markdown: '![image](upload://image.jpg)' } })
    await expect(result).resolves.toMatchObject({ value: { state: 'done' } })
    const before = f.sent.mock.calls.length
    await expect(f.host.call('upload', { data: 'a'.repeat(3 * 1024 * 1024) })).rejects.toThrow('3145728')
    expect(f.sent.mock.calls).toHaveLength(before)
    expect(() => f.host.setState({ data })).toThrow('32768')
    expect(f.sent.mock.calls).toHaveLength(before)
  })
})
