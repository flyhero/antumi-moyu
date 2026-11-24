import { describe, expect, it } from 'vitest'
import type { Post } from '../../src/community'
import { receivedReply, type SubmittedReply } from './submitted-reply'

const post: Post = { id: '123', floor: 47, author: 'alice', avatar: null, html: '<p>Repeated text</p>', time: null, replyTo: null, likes: 0, byAuthor: false }
const reply: SubmittedReply = { id: 1, text: 'Repeated text', target: null, author: 'alice', time: 0,
  result: { state: 'sent', message: null, location: { postId: '123', floor: 47 } } }

describe('submitted reply reconciliation', () => {
  it('matches stable post ids even when the returned content was edited', () => {
    expect(receivedReply(reply, { ...post, html: '<p>Edited</p>' })).toBe(true)
    expect(receivedReply(reply, { ...post, id: '456' })).toBe(false)
    expect(receivedReply(reply, { ...post, id: undefined })).toBe(false)
  })

  it('requires both the official floor and the author when no post id was returned', () => {
    const withoutId: SubmittedReply = { ...reply, result: { state: 'sent', message: null, location: { floor: 47 } } }
    expect(receivedReply(withoutId, post)).toBe(true)
    expect(receivedReply(withoutId, { ...post, author: 'bob' })).toBe(false)
    expect(receivedReply(withoutId, { ...post, floor: 48 })).toBe(false)
  })

  it('does not guess matches from identical content or treat moderation as public confirmation', () => {
    expect(receivedReply({ ...reply, result: { state: 'sent', message: null } }, post)).toBe(false)
    expect(receivedReply({ ...reply, result: { state: 'pending', message: null } }, post)).toBe(false)
  })
})
