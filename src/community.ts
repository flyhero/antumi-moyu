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
  // The forum's own id for it, which a like addresses; absent where the forum's reading endpoint does not say.
  id: z.string().regex(/^\d{1,16}$/).optional(),
  // The number the forum shows beside the post; 1 is the first reply on V2EX and the opening post on linux.do.
  floor: z.number().int().nonnegative(),
  author: z.string(),
  avatar: z.string().nullable(),
  // The forum's own HTML with its relative links made absolute. Untrusted: the page sanitizes it.
  html: z.string(),
  time: z.number().nullable(),
  // The floor it answers, when the forum says.
  replyTo: z.number().int().nonnegative().nullable(),
  likes: z.number().int().nonnegative().nullable(),
  // Whether the signed-in reader has liked (V2EX: thanked) it; absent when reading anonymously or when it cannot be liked, such as one's own post.
  liked: z.boolean().optional(),
  // Whether the person who started the topic wrote it. The forums compare account ids, not names.
  byAuthor: z.boolean()
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

export const ForumAccount = z.object({ username: z.string().min(1).max(100), unreadNotifications: z.number().int().nonnegative().optional(), userId: z.number().int().positive().optional() })
export type ForumAccount = z.infer<typeof ForumAccount>
export const ReplyTarget = z.object({
  floor: z.number().int().positive(),
  author: z.string().min(1).max(100).regex(/^[\p{L}\p{N}_.-]+$/u)
})
export type ReplyTarget = z.infer<typeof ReplyTarget>
export const ReplyParams = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  content: z.string().trim().min(1).max(8000),
  target: ReplyTarget.optional()
})
export const ReplyLocation = z.object({ floor: z.number().int().positive().optional(), page: z.number().int().min(1).max(1000).optional() })
export type ReplyLocation = z.infer<typeof ReplyLocation>
export const ReplyFailure = z.object({
  kind: z.enum(['login', 'rate-limit', 'unconfirmed', 'rejected']),
  message: z.string(),
  retryAfter: z.number().int().min(1).max(86400).optional()
})
export type ReplyFailure = z.infer<typeof ReplyFailure>
export const ReplyResult = z.discriminatedUnion('state', [
  z.object({ state: z.literal('sent'), message: z.string().nullable(), location: ReplyLocation.optional() }),
  z.object({ state: z.literal('pending'), message: z.string().nullable() }),
  z.object({ state: z.literal('failed'), failure: ReplyFailure })
])
export type ReplyResult = z.infer<typeof ReplyResult>

// The id is the post's (linux.do) or the reply's (V2EX), not its floor; V2EX also needs the topic for a fresh once.
export const LikeParams = z.object({
  topic: z.string().regex(/^\d{1,12}$/),
  post: z.string().regex(/^\d{1,16}$/),
  liked: z.boolean(),
  // V2EX thanks a topic and a reply at different addresses; linux.do's opening post is a post like any other.
  opening: z.boolean().optional()
})
export const LikeResult = z.discriminatedUnion('state', [
  z.object({ state: z.literal('done'), liked: z.boolean(), likes: z.number().int().nonnegative().nullable() }),
  z.object({ state: z.literal('failed'), failure: ReplyFailure })
])
export type LikeResult = z.infer<typeof LikeResult>

// A picture for a reply, compressed by the page; data is its bytes in base64. The page keeps it
// under the host's 3 MiB call limit.
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export const UploadParams = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(UPLOAD_TYPES),
  data: z.string().min(1).max(3_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/)
})
export const UploadResult = z.discriminatedUnion('state', [
  // What goes into the draft where the picture should be: the forum's own markdown for it.
  z.object({ state: z.literal('done'), markdown: z.string().min(1).max(1000) }),
  z.object({ state: z.literal('failed'), failure: ReplyFailure })
])
export type UploadResult = z.infer<typeof UploadResult>

export const ForumNotification = z.object({
  id: z.string().regex(/^\d{1,16}$/),
  kind: z.enum(['reply', 'mention', 'like', 'quote', 'message', 'other']),
  actor: z.string().nullable(),
  title: z.string(),
  excerpt: z.string().nullable(),
  time: z.number().nullable(),
  timeLabel: z.string().nullable(),
  read: z.boolean().nullable(),
  url: z.string().url(),
  target: z.object({ topic: Topic, floor: z.number().int().positive().max(1_000_000).optional(), page: z.number().int().min(1).max(1000).optional(), postId: z.string().regex(/^\d{1,16}$/).optional() }).nullable()
})
export type ForumNotification = z.infer<typeof ForumNotification>
export const NotificationPage = z.object({
  account: z.string(), items: z.array(ForumNotification), page: z.number().int().positive(), more: z.boolean(),
  unread: z.number().int().nonnegative().nullable(), seenId: z.number().int().nonnegative().nullable(),
  readOnOpen: z.boolean()
})
export type NotificationPage = z.infer<typeof NotificationPage>
export const NotificationParams = z.object({ account: z.string().min(1).max(100), page: z.number().int().min(1).max(1000).default(1) })
export const NotificationReadParams = z.object({ account: z.string().min(1).max(100), id: z.string().regex(/^\d{1,16}$/) })
// What linux.do's home page says about its notification stream. The page keeps it in memory only
// and hands it back, so a poll does not fetch the home page again; it is never saved.
export const NotificationBootstrap = z.object({
  origin: z.enum(['https://linux.do', 'https://ping.linux.do']), path: z.string().regex(/^\/[\w./-]{0,100}$/).refine((path) => !path.includes('..')),
  sharedKey: z.string().min(1).max(512).optional(), interval: z.number().int().min(1000).max(180_000)
})
export type NotificationBootstrap = z.infer<typeof NotificationBootstrap>
export const NotificationWatchParams = z.object({
  account: z.string().min(1).max(100), clientId: z.string().regex(/^[a-f0-9]{32}$/),
  cursor: z.number().int().min(-1).optional(), userId: z.number().int().positive().optional(), bootstrap: NotificationBootstrap.optional()
})
export const NotificationUpdate = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ok'), account: ForumAccount, cursor: z.number().int().min(-1).optional(), changed: z.boolean(),
    interval: z.number().int().min(100).max(180_000), bootstrap: NotificationBootstrap.optional() }),
  z.object({ state: z.enum(['retry', 'login']), message: z.string(), retryAfter: z.number().int().min(1).max(86400).optional() })
])
export type NotificationUpdate = z.infer<typeof NotificationUpdate>

export const ListParams = z.object({ community: CommunityId, channel: z.string().min(1).max(64) })
export type ListParams = z.infer<typeof ListParams>
export const ThreadParams = z.object({ community: CommunityId, id: z.string().regex(/^\d{1,12}$/), page: z.number().int().positive().max(1000).default(1), floor: z.number().int().positive().max(1_000_000).optional(), tail: z.boolean().optional() })
export type ThreadParams = z.infer<typeof ThreadParams>

// What a forum is to the reader. Each call is one visit to the forum at most two requests long; a
// refusal is an Error whose message the page shows as it is.
export type Community = {
  info: CommunityInfo
  list(channel: string, signal: AbortSignal): Promise<Topic[]>
  thread(id: string, page: number, signal: AbortSignal, focus?: { floor?: number; tail?: boolean }): Promise<Thread>
}

// The page's calls to the backend, by method name: what it sends and what it gets.
export type ReaderMethods = {
  session: { params: undefined; result: ForumAccount | null }
  login: { params: undefined; result: { opened: boolean } }
  logout: { params: undefined; result: { disconnected: boolean } }
  notifications: { params: z.input<typeof NotificationParams>; result: NotificationPage }
  notificationRead: { params: z.input<typeof NotificationReadParams>; result: { read: boolean } }
  notificationWatch: { params: z.input<typeof NotificationWatchParams>; result: NotificationUpdate }
  reply: { params: z.input<typeof ReplyParams>; result: ReplyResult }
  like: { params: z.input<typeof LikeParams>; result: LikeResult }
  upload: { params: z.input<typeof UploadParams>; result: UploadResult }
  communities: { params: undefined; result: CommunityInfo[] }
  list: { params: z.input<typeof ListParams>; result: Topic[] }
  thread: { params: z.input<typeof ThreadParams>; result: Thread }
}
