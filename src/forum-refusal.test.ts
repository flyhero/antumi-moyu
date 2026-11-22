import { afterEach, describe, expect, it, vi } from 'vitest'
import { forumRefusal } from './forum-refusal.js'

afterEach(() => vi.restoreAllMocks())
describe('forum refusal diagnostics', () => {
  it('recognizes challenge pages even with status 429 and a stripped challenge header', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const status of [200, 403, 429]) {
      expect(forumRefusal({ status, headers: {}, body: '<html><title>Just a moment...</title></html>' })).toMatchObject({ kind: 'challenge', message: expect.stringContaining('Cloudflare 验证') })
    }
    expect(forumRefusal({ status: 429, headers: { 'cf-mitigated': 'challenge' }, body: '' })?.kind).toBe('challenge')
  })

  it('reads wait_seconds when Retry-After is missing, and prefers a valid Retry-After', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = { status: 429, headers: {}, body: '{"extras":{"wait_seconds":13.1}}' }
    expect(forumRefusal(response)).toMatchObject({ kind: 'rate-limit', retryAfter: 14 })
    expect(forumRefusal({ ...response, headers: { 'retry-after': '20' } })?.retryAfter).toBe(20)
    expect(forumRefusal({ ...response, body: '{"wait_seconds":17}' })?.retryAfter).toBe(17)
    expect(forumRefusal({ ...response, headers: { 'retry-after': new Date(20_000).toUTCString() } }, 1000)?.retryAfter).toBe(19)
    expect(forumRefusal({ ...response, body: '{"extras":{"wait_seconds":-1}}' })?.retryAfter).toBeUndefined()
  })

  it('logs only safe diagnostics and never the response body or private headers', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    forumRefusal({ status: 429, headers: { 'cf-ray': 'ray-id', 'discourse-rate-limit-error-code': 'user_10_secs_limit', 'set-cookie': 'session-secret' }, body: 'private response' })
    const recorded = JSON.stringify(log.mock.calls)
    expect(recorded).toContain('user_10_secs_limit')
    expect(recorded).toContain('ray-id')
    expect(recorded).not.toMatch(/session-secret|private response/)
    expect(forumRefusal({ status: 200, headers: {}, body: '{"post_stream":{}}' })).toBeNull()
    expect(forumRefusal({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cooked: '<html><title>Just a moment</title></html>' }) })).toBeNull()
  })
})
