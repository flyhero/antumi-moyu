import { load } from 'cheerio/slim'
import { z } from 'zod'
import type { PluginPageContext } from '@antumi/plugin-sdk'
import { likedOf, likesOf, RawPost } from './communities/linuxdo.js'
import { LikeParams, type CommunityId, type LikeResult } from './community.js'
import { checkedSite, discourseCsrf, siteFailure, siteRequest, v2exAccount } from './forum-session.js'
import { parseJson } from './json-body.js'
import { forumRefusal } from './forum-refusal.js'

const DiscourseErrors = z.object({ errors: z.array(z.string()).min(1), extras: z.object({ wait_seconds: z.number().optional() }).nullish() })

// A like is one click with nothing to lose, so a failure is only reported: the page keeps what it showed.
export async function likeOutcome(community: CommunityId, params: unknown, context: PluginPageContext): Promise<LikeResult> {
  try {
    return await (community === 'linuxdo' ? likeOnLinuxdo : thankOnV2ex)(LikeParams.parse(params), context)
  } catch (error) {
    const failure = siteFailure(error)
    return { state: 'failed', failure: failure ?? { kind: 'rejected', message: error instanceof Error ? error.message : String(error) } }
  }
}

// Core's like action, which the reactions plugin counts as its heart. The browser bridge sends only
// GET and POST; Discourse keeps Rails' _method override, so an undo is a POST that says DELETE.
async function likeOnLinuxdo({ post, liked }: z.infer<typeof LikeParams>, context: PluginPageContext): Promise<LikeResult> {
  const csrf = await discourseCsrf(context)
  if (!csrf) return { state: 'failed', failure: { kind: 'login', message: '未能取得点赞所需的验证信息，请重新登录' } }
  const body = liked
    ? new URLSearchParams({ id: post, post_action_type_id: '2', flag_topic: 'false' })
    : new URLSearchParams({ _method: 'DELETE', post_action_type_id: '2' })
  const response = await siteRequest(context, liked ? '/post_actions' : `/post_actions/${post}`, {
    method: 'POST', body: body.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': csrf, 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' }
  })
  let data: unknown = null
  try { data = JSON.parse(response.body) } catch { /* a challenge page or an empty body */ }
  const errors = DiscourseErrors.safeParse(data)
  if (errors.success) {
    const refusal = forumRefusal(response)
    if (refusal?.kind === 'challenge') return { state: 'failed', failure: { kind: 'login', message: refusal.message } }
    const wait = errors.data.extras?.wait_seconds
    const retryAfter = refusal?.retryAfter ?? (wait && wait >= 1 ? Math.min(Math.ceil(wait), 86400) : undefined)
    if (response.status === 429) return { state: 'failed', failure: { kind: 'rate-limit', message: errors.data.errors.join('；'), ...(retryAfter ? { retryAfter } : {}) } }
    return { state: 'failed', failure: { kind: 'rejected', message: errors.data.errors.join('；') } }
  }
  checkedSite(response)
  const updated = RawPost.safeParse(data)
  if (!updated.success) return { state: 'done', liked, likes: null }
  return { state: 'done', liked: likedOf(updated.data) ?? liked, likes: likesOf(updated.data) }
}

// V2EX's thanks cost the sender coins and cannot be taken back.
async function thankOnV2ex({ topic, post, liked, opening }: z.infer<typeof LikeParams>, context: PluginPageContext): Promise<LikeResult> {
  if (!liked) return { state: 'failed', failure: { kind: 'rejected', message: 'V2EX 的感谢发出后不能撤回' } }
  const html = checkedSite(await siteRequest(context, `/t/${topic}`))
  if (!v2exAccount(html)) return { state: 'failed', failure: { kind: 'login', message: '请先登录再感谢' } }
  const $ = load(html)
  const once = /\bvar once = "(\d+)"/.exec(html)?.[1] ?? $('input[name="once"]').first().attr('value')
  if (!once) throw new Error('未能取得感谢所需的验证信息，请在浏览器查看')
  const response = await siteRequest(context, `${opening ? `/thank/topic/${topic}` : `/thank/reply/${post}`}?once=${encodeURIComponent(once)}`, {
    method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' }
  })
  const result = z.object({ success: z.boolean(), message: z.string().optional() }).safeParse(parseJson(checkedSite(response), 'V2EX'))
  if (!result.success) throw new Error('V2EX 返回的内容读不懂')
  if (!result.data.success) return { state: 'failed', failure: { kind: 'rejected', message: result.data.message || 'V2EX 没有接受这次感谢' } }
  return { state: 'done', liked: true, likes: null }
}
