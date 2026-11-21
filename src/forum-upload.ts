import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { PluginPageContext } from '@antumi/plugin-sdk'
import { UploadParams, type CommunityId, type UploadResult } from './community.js'
import { checkedSite, discourseCsrf, siteFailure, siteRequest } from './forum-session.js'

const Uploaded = z.object({ short_url: z.string().regex(/^upload:\/\/[\w.-]+$/), width: z.number().int().positive().nullish(), height: z.number().int().positive().nullish() })
const DiscourseErrors = z.object({ errors: z.array(z.string()).min(1) })

// A multipart form as Discourse's composer sends it: synchronous, so the answer is the upload itself.
function form(boundary: string, name: string, type: string, bytes: Buffer): Buffer {
  const field = (key: string, value: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
  const filename = name.replace(/["\r\n\\]/g, '_')
  return Buffer.concat([
    Buffer.from(field('type', 'composer') + field('synchronous', 'true')),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
}

// The alt text Discourse writes for a picture: its name without what markdown would read as syntax.
function altOf(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[[\]|()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'image'
}

export async function uploadOutcome(community: CommunityId, params: unknown, context: PluginPageContext): Promise<UploadResult> {
  try {
    if (community !== 'linuxdo') throw new Error('这个社区不支持在插件里上传图片')
    const { name, type, data } = UploadParams.parse(params)
    const csrf = await discourseCsrf(context)
    if (!csrf) return { state: 'failed', failure: { kind: 'login', message: '未能取得上传所需的验证信息，请重新登录' } }
    const boundary = `----antumi${randomBytes(12).toString('hex')}`
    const response = await siteRequest(context, '/uploads.json', {
      method: 'POST', bodyEncoding: 'base64', body: form(boundary, name, type, Buffer.from(data, 'base64')).toString('base64'), timeoutMs: 40_000,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-csrf-token': csrf, 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' }
    })
    let body: unknown = null
    try { body = JSON.parse(response.body) } catch { /* a challenge page or a proxy's error */ }
    const errors = DiscourseErrors.safeParse(body)
    if (errors.success) return { state: 'failed', failure: { kind: response.status === 429 ? 'rate-limit' : 'rejected', message: errors.data.errors.join('；') } }
    if (response.status === 413) return { state: 'failed', failure: { kind: 'rejected', message: '图片太大，linux.do 没有接受' } }
    checkedSite(response)
    const uploaded = Uploaded.safeParse(body)
    if (!uploaded.success) throw new Error('linux.do 返回的内容读不懂')
    const { short_url: url, width, height } = uploaded.data
    return { state: 'done', markdown: `![${altOf(name)}${width && height ? `|${width}x${height}` : ''}](${url})` }
  } catch (error) {
    const failure = siteFailure(error)
    return { state: 'failed', failure: failure ?? { kind: 'rejected', message: error instanceof Error ? error.message : String(error) } }
  }
}
