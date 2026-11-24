import type { Post, ReplyResult, ReplyTarget } from '../../src/community'

export type SubmittedReply = {
  id: number
  text: string
  target: ReplyTarget | null
  author: string
  time: number
  result: Exclude<ReplyResult, { state: 'failed' }>
}

// Prefer stable ids. Without one, only the server's floor and the sending account can match;
// another person's reply, or an identical sentence elsewhere, must not consume a local reply.
export function receivedReply(reply: SubmittedReply, post: Post): boolean {
  if (reply.result.state !== 'sent') return false
  const id = reply.result.post?.id ?? reply.result.location?.postId
  if (id !== undefined) return post.id === id
  const floor = reply.result.post?.floor ?? reply.result.location?.floor
  return floor !== undefined && post.floor === floor && post.author === reply.author
}
