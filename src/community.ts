import { z } from 'zod'

// One shape for every forum, so the page draws a thread without knowing where it came from.

export const CommunityId = z.enum(['linuxdo', 'v2ex'])
export type CommunityId = z.infer<typeof CommunityId>

// A list within a community: its latest or hottest topics, a category, a node.
export const Channel = z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(64) })
export type Channel = z.infer<typeof Channel>

export const CommunityInfo = z.object({ id: CommunityId, name: z.string(), channels: z.array(Channel).min(1) })
export type CommunityInfo = z.infer<typeof CommunityInfo>

export const Topic = z.object({
  community: CommunityId,
  id: z.string().min(1).max(32),
  title: z.string(),
  author: z.string(),
  // An https URL, or null when the forum's list does not say.
  avatar: z.string().nullable(),
  // The category or node it is in, as the forum shows it.
  channel: z.string().nullable(),
  replies: z.number().int().nonnegative().nullable(),
  // Milliseconds; when it was last active if the forum says, else when it was posted.
  time: z.number().nullable(),
  url: z.string()
})
export type Topic = z.infer<typeof Topic>

export const Post = z.object({
  // The number the forum shows beside the post; 1 is the first reply on V2EX and the opening post on linux.do.
  floor: z.number().int().nonnegative(),
  author: z.string(),
  avatar: z.string().nullable(),
  // The forum's own HTML with its relative links made absolute. Untrusted: the page sanitizes it.
  html: z.string(),
  time: z.number().nullable(),
  // The floor it answers, when the forum says.
  replyTo: z.number().int().nonnegative().nullable(),
  likes: z.number().int().nonnegative().nullable()
})
export type Post = z.infer<typeof Post>

export const Thread = z.object({
  topic: Topic,
  // What the author wrote; on the first page alone.
  opening: Post.nullable(),
  // The replies of this page, in order.
  posts: z.array(Post),
  page: z.number().int().positive(),
  // Whether a next page exists.
  more: z.boolean()
})
export type Thread = z.infer<typeof Thread>

export const ListParams = z.object({ community: CommunityId, channel: z.string().min(1).max(64) })
export type ListParams = z.infer<typeof ListParams>
export const ThreadParams = z.object({ community: CommunityId, id: z.string().regex(/^\d{1,12}$/), page: z.number().int().positive().max(1000).default(1) })
export type ThreadParams = z.infer<typeof ThreadParams>

// What a forum is to the reader. Each call is one visit to the forum at most two requests long; a
// refusal is an Error whose message the page shows as it is.
export type Community = {
  info: CommunityInfo
  list(channel: string, signal: AbortSignal): Promise<Topic[]>
  thread(id: string, page: number, signal: AbortSignal): Promise<Thread>
}

// The page's calls to the backend, by method name: what it sends and what it gets.
export type ReaderMethods = {
  communities: { params: undefined; result: CommunityInfo[] }
  list: { params: z.input<typeof ListParams>; result: Topic[] }
  thread: { params: z.input<typeof ThreadParams>; result: Thread }
}
