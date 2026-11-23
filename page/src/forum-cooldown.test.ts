import { afterEach, describe, expect, it } from 'vitest'
import { clearForumCooldown, forumAccessState, forumCanResume, forumCooldownRemaining, forumCoolingDown, noteForumRefusal } from './forum-cooldown'

describe('forum cooldown', () => {
  afterEach(() => clearForumCooldown())

  it('marks a refusal that comes straight back after the user resumed', () => {
    noteForumRefusal('browser', '社区要求 Cloudflare 验证', 0)
    expect(forumAccessState('browser')?.again).toBeUndefined()
    expect(forumCanResume('browser', 0)).toBe(true)
    clearForumCooldown('browser', 1_000)
    noteForumRefusal('browser', '社区要求 Cloudflare 验证', 2_000)
    expect(forumAccessState('browser')?.again).toBe(true)
    clearForumCooldown('browser', 3_000)
    noteForumRefusal('browser', '请求过于频繁，请 5 秒后再试', 3_000 + 60_000)
    expect(forumAccessState('browser')?.again).toBeUndefined()
    expect(forumCanResume('browser', 3_000 + 60_000)).toBe(false)
    expect(forumCanResume('browser', 3_000 + 65_000)).toBe(true)
  })

  it('stays idle until a refusal is noted', () => {
    expect(forumCoolingDown('browser', 1_000)).toBe(false)
    expect(forumCooldownRemaining('browser', 1_000)).toBe(0)
  })

  it('reads an explicit retry delay from the refusal text', () => {
    noteForumRefusal('browser', '请求过于频繁，请 15 秒后再试', 1_000)
    expect(forumCoolingDown('browser', 1_000)).toBe(true)
    expect(forumCooldownRemaining('browser', 1_000)).toBe(15_000)
    expect(forumCoolingDown('browser', 16_000)).toBe(false)
  })

  it('uses a default minute for bare rate-limit and Cloudflare refusals', () => {
    noteForumRefusal('browser', '请求过于频繁，请稍后再试', 1_000)
    expect(forumCooldownRemaining('browser', 1_000)).toBe(60_000)
    clearForumCooldown()
    noteForumRefusal('browser', 'linux.do 暂时拦住了请求，过一会儿再试', 2_000)
    expect(forumCooldownRemaining('browser', 2_000)).toBe(60_000)
  })

  it('keeps the longer of overlapping cooldowns', () => {
    noteForumRefusal('browser', '请求过于频繁，请 10 秒后再试', 1_000)
    noteForumRefusal('browser', '请求过于频繁，请 30 秒后再试', 5_000)
    expect(forumCooldownRemaining('browser', 5_000)).toBe(30_000)
  })
})
