import type { CommunityId, CommunityInfo, Post, Thread, Topic } from '../../src/community'

// What the preview shows in place of the forums: lists and threads in the backend's shape, with the
// HTML each forum really sends (quotes, pictures, emoji, code), so the page meets what it will meet.

export const mockCommunities: CommunityInfo[] = [
  {
    id: 'linuxdo',
    name: 'linux.do',
    channels: [
      { id: 'latest', name: '最新' }, { id: 'top', name: '热门' }, { id: 'develop', name: '开发调优' }, { id: 'gossip', name: '搞七捻三' },
      { id: 'resource', name: '资源荟萃' }, { id: 'welfare', name: '福利羊毛' }, { id: 'news', name: '前沿快讯' }
    ]
  },
  {
    id: 'v2ex',
    name: 'V2EX',
    channels: [
      { id: 'hot', name: '最热' }, { id: 'latest', name: '最新' }, { id: 'programmer', name: '程序员' }, { id: 'share', name: '分享发现' },
      { id: 'create', name: '分享创造' }, { id: 'qna', name: '问与答' }, { id: 'jobs', name: '酷工作' }, { id: 'career', name: '职场话题' }, { id: 'python', name: 'Python' }
    ]
  }
]

// The people here are made up and have no pictures: the page draws an initial instead, as it does
// when a forum gives none.
const avatars: Record<string, string> = {}

const emoji = (name: string) => `<img src="https://cdn.ldstatic.com/images/emoji/twemoji/${name}.png?v=12" title=":${name}:" class="emoji" alt=":${name}:" loading="lazy" width="20" height="20">`
const picture = (alt: string) => `<div class="lightbox-wrapper"><a class="lightbox" href="https://cdn3.ldstatic.com/original/4X/c/a/7/ca785958d37aba2c5e234af1f4d969945ae87b2f.jpeg" title="${alt}"><img src="https://cdn3.ldstatic.com/optimized/4X/c/a/7/ca785958d37aba2c5e234af1f4d969945ae87b2f_2_690x388.jpeg" alt="${alt}" width="690" height="388"><div class="meta"><span class="filename">${alt}</span><span class="informations">1920×1080 245 KB</span></div></a></div>`
const v2Mention = (name: string) => `@<a href="https://www.v2ex.com/member/${name}">${name}</a>`

type Seed = { id: string; title: string; author: string; channel: string; replies: number; minutes: number }

const topics: Record<CommunityId, Seed[]> = {
  linuxdo: [
    { id: '3200001', title: 'Claude Code 和 Codex 一起用的工作流分享，附配置', author: '青柠', channel: '开发调优', replies: 25, minutes: 4 },
    { id: '3192714', title: '开了个Google Ultra 20x，有什么隐藏权益可以领以及正常用argon周限有多少刀', author: '山风', channel: '搞七捻三', replies: 12, minutes: 18 },
    { id: '3188020', title: '应该是目前最强的PPT Agent，附上完整思路分享', author: 'long_night', channel: '开发调优', replies: 230, minutes: 35 },
    { id: '3186511', title: '求推荐一个好用的自托管 RSS 阅读器', author: '老周', channel: '资源荟萃', replies: 41, minutes: 52 },
    { id: '3185320', title: 'Docker 镜像加速又挂了？整理一份现在还能用的源', author: 'dusk', channel: '资源荟萃', replies: 88, minutes: 75 },
    { id: '3184002', title: 'Mac mini M5 到手，记录一下开发环境迁移', author: '一只鹿', channel: '开发调优', replies: 19, minutes: 140 },
    { id: '3182777', title: '关于 pnpm workspace 里 TypeScript 项目引用的一个坑', author: '小满', channel: '开发调优', replies: 7, minutes: 200 },
    { id: '3181234', title: '每日摸鱼打卡第 128 天', author: '七月', channel: '搞七捻三', replies: 302, minutes: 260 },
    { id: '3179950', title: '家里 NAS 硬盘报警了，数据恢复求助', author: '阿福', channel: '搞七捻三', replies: 23, minutes: 380 },
    { id: '3178001', title: 'SQLite 在服务端到底能不能扛住生产流量', author: 'momo', channel: '开发调优', replies: 64, minutes: 600 },
    { id: '3176543', title: 'Cloudflare Workers 免费额度又调整了', author: '阿橘', channel: '前沿快讯', replies: 37, minutes: 900 },
    { id: '3175002', title: '用 Tauri 做了个小工具，打包体积只有 8MB', author: 'kiwi', channel: '开发调优', replies: 15, minutes: 1500 },
    { id: '3172210', title: '周末去爬山了，分享几张照片', author: 'haze', channel: '搞七捻三', replies: 9, minutes: 2900 },
    { id: '3170001', title: '新出的 OpenCode 2 有人试过了吗', author: 'mint', channel: '前沿快讯', replies: 56, minutes: 5000 },
    { id: '3165555', title: '某云服务器首年 99 元，配置还行，需要的冲', author: '团子', channel: '福利羊毛', replies: 140, minutes: 12000 }
  ],
  v2ex: [
    { id: '1257800', title: 'Python 3.14 的 free-threading 实际项目里有人用上了吗', author: 'snowpea', channel: 'Python', replies: 25, minutes: 6 },
    { id: '1257707', title: '今天是我的生日', author: 'pixel', channel: '生活', replies: 74, minutes: 22 },
    { id: '1257650', title: '35 岁程序员，被裁后的第三个月', author: 'nimbus', channel: '职场话题', replies: 186, minutes: 48 },
    { id: '1257611', title: '大家现在写代码还手写单测吗', author: '大白', channel: '程序员', replies: 93, minutes: 66 },
    { id: '1257590', title: '分享一个自己做的 Markdown 简历生成器', author: '北岛', channel: '分享创造', replies: 28, minutes: 95 },
    { id: '1257533', title: '有没有必要为了 AI 编程换 64G 内存的电脑', author: 'tinkerer', channel: '问与答', replies: 61, minutes: 130 },
    { id: '1257501', title: '[上海/远程] 全栈工程师 25-40k', author: '木子', channel: '酷工作', replies: 12, minutes: 170 },
    { id: '1257480', title: 'iCloud 照片同步卡住了怎么办', author: 'lemon7', channel: '问与答', replies: 17, minutes: 240 },
    { id: '1257442', title: 'FastAPI 还是 Django，新项目怎么选', author: 'byte', channel: 'Python', replies: 102, minutes: 320 },
    { id: '1257400', title: '记录一次线上 Postgres 死锁排查', author: 'ohayo', channel: '程序员', replies: 33, minutes: 480 },
    { id: '1257366', title: '推荐一些适合程序员听的播客', author: '半糖', channel: '分享发现', replies: 45, minutes: 700 },
    { id: '1257301', title: '公司要求每天写日报，大家怎么看', author: 'nimbus', channel: '职场话题', replies: 210, minutes: 1100 },
    { id: '1257250', title: '用 uv 管理 Python 项目一年后的感受', author: '大白', channel: 'Python', replies: 58, minutes: 1700 },
    { id: '1257199', title: 'V2EX 的夜间模式是不是坏了', author: 'tinkerer', channel: '问与答', replies: 8, minutes: 3000 },
    { id: '1257100', title: '自己写了个终端里看 RSS 的小工具', author: '北岛', channel: '分享创造', replies: 21, minutes: 9000 }
  ]
}

function topicUrl(community: CommunityId, id: string): string {
  return community === 'linuxdo' ? `https://linux.do/t/topic/${id}` : `https://www.v2ex.com/t/${id}`
}

function toTopic(community: CommunityId, seed: Seed, now: number): Topic {
  return {
    community,
    id: seed.id,
    title: seed.title,
    author: seed.author,
    avatar: avatars[seed.author] ?? null,
    channel: seed.channel,
    replies: seed.replies,
    time: now - seed.minutes * 60_000,
    url: topicUrl(community, seed.id)
  }
}

export function mockList(community: CommunityId, channel: string, now: number): Topic[] {
  const all = topics[community]
  const name = mockCommunities.find((info) => info.id === community)?.channels.find((one) => one.id === channel)?.name
  const picked = all.filter((seed) => seed.channel === name)
  const list = picked.length > 0 ? picked : channel === 'top' || channel === 'hot' ? [...all].sort((a, b) => b.replies - a.replies) : all
  return list.map((seed) => toTopic(community, seed, now))
}

type Reply = { author: string; html: string; replyTo?: number; likes?: number }

const linuxdoOpening = [
  '<p>用了两个月，摸索出一套 Claude Code 写、Codex 审的流程，效率提升挺明显的，分享给佬友们参考。</p>',
  '<h3>为什么两个一起用</h3>',
  '<p>单用一个的时候，最大的问题是<strong>自己写的代码自己审</strong>，同样的盲点会出现两次。换一个模型来审，能挑出不少问题。</p>',
  '<ul><li>Claude Code：负责写功能、改大块代码</li><li>Codex：负责 review、补测试、找边界情况</li><li>我：负责拍板和合并</li></ul>',
  '<p>项目根目录放一份 <code>AGENTS.md</code>，两边共用：</p>',
  '<pre><code class="lang-json">{\n  "permissions": {\n    "allow": ["Bash(pnpm test:*)", "Bash(pnpm typecheck)"],\n    "deny": ["Bash(git push:*)"]\n  }\n}</code></pre>',
  '<p>效果大概是这样：</p>',
  `<p>${picture('工作流截图')}</p>`,
  '<h3>几个踩过的坑</h3>',
  '<ol><li>两个 agent 不要在同一个目录里同时改文件，用 worktree 隔开</li><li>review 的提示词要具体，不然只会夸你</li><li>测试命令写进 AGENTS.md，不然它们会自己发明</li></ol>',
  '<p>欢迎补充 ' + emoji('hugs') + '</p>'
].join('\n')

const linuxdoReplies: Reply[] = [
  { author: '山风', html: `<p>感谢分享，先收藏了 ${emoji('hugs')}</p>`, likes: 3 },
  { author: 'long_night', html: '<p>请教一下，<code>CLAUDE.md</code> 和 <code>AGENTS.md</code> 你是怎么同步的？软链接吗？</p>', likes: 1 },
  {
    author: '青柠',
    html: `<aside class="quote no-group" data-username="long_night" data-post="3" data-topic="3200001"><div class="title"><div class="quote-controls"></div>long_night:</div><blockquote><p>请教一下，CLAUDE.md 和 AGENTS.md 你是怎么同步的？软链接吗？</p></blockquote></aside>\n<p>不用软链接，<code>CLAUDE.md</code> 里就一行：</p>\n<pre><code class="lang-markdown">@AGENTS.md</code></pre>\n<p>这样两边读到的是同一份。</p>`,
    replyTo: 3,
    likes: 8
  },
  { author: '阿橘', html: '<p>Codex 那边的 sandbox 配置能贴一下吗？我这边老是没权限写 <code>~/.cache</code></p>' },
  {
    author: '青柠',
    html: '<p>可以，<code>~/.codex/config.toml</code>：</p>\n<pre><code class="lang-toml">sandbox_mode = "workspace-write"\n\n[sandbox_workspace_write]\nwritable_roots = ["~/.cache", "/tmp"]\nnetwork_access = true</code></pre>',
    replyTo: 5,
    likes: 5
  },
  { author: '阿福', html: '<p>mark，周末试试</p>' },
  { author: '老周', html: '<p>两个一起开不会抢文件吗？比如同时改同一个文件</p>' },
  {
    author: '青柠',
    html: '<p>所以我是开两个 worktree 的：</p>\n<ol>\n<li>Claude 负责写功能，在 <code>feat/xxx</code></li>\n<li>Codex 负责 review 和补测试，在另一个 worktree</li>\n<li>最后我自己合</li>\n</ol>\n<p>不会互相踩。</p>',
    replyTo: 8,
    likes: 12
  },
  {
    author: 'dusk',
    html: '<p>我也整理过一份对比，供参考：</p>\n<table><thead><tr><th>场景</th><th>Claude Code</th><th>Codex</th></tr></thead><tbody><tr><td>大改动</td><td>稳</td><td>偏保守</td></tr><tr><td>Review</td><td>话多</td><td>挑刺准</td></tr><tr><td>速度</td><td>中</td><td>快</td></tr></tbody></table>',
    likes: 6
  },
  { author: 'haze', html: `<p>最强的还是人肉 review ${emoji('laughing')}</p>` },
  { author: '一只鹿', html: `<p>贴一下我这边的效果</p>\n<p>${picture('终端截图')}</p>`, likes: 2 },
  { author: 'momo', html: `<p>这个界面是什么终端？看着挺干净的 <img src="https://cdn3.ldstatic.com/original/3X/3/3/3339b15ea7c025039809fab82a3b3e4d31f80b80.png?v=14" title=":bili_040:" class="emoji emoji-custom" alt=":bili_040:" width="20" height="20"></p>`, replyTo: 12 },
  { author: '一只鹿', html: '<p>Ghostty，主题是 <a href="https://github.com/catppuccin/ghostty">catppuccin</a></p>', replyTo: 13 },
  {
    author: 'kiwi',
    html: '<details><summary>我的完整 hooks 配置（有点长）</summary>\n<pre><code class="lang-json">{\n  "hooks": {\n    "PostToolUse": [\n      { "matcher": "Edit", "command": "pnpm lint --fix" }\n    ]\n  }\n}</code></pre>\n</details>',
    likes: 4
  },
  { author: '小满', html: '<p>打卡。学到了。</p>' },
  { author: 'mint', html: '<p>想问下这套下来一个月大概多少钱？</p>' },
  { author: '青柠', html: `<p>两个订阅加起来 $220 左右，比招个实习生便宜 ${emoji('laughing')}</p>`, replyTo: 17, likes: 9 },
  { author: '团子', html: '<blockquote>\n<p>比招个实习生便宜</p>\n</blockquote>\n<p>这句话太真实了</p>', replyTo: 18 },
  { author: '七月', html: '<p>楼主的 <code>AGENTS.md</code> 能开源吗，想参考下怎么写约束</p>' },
  {
    author: '青柠',
    html: '<p>整理一下过几天发个新帖，主要就三块：</p>\n<ul>\n<li>进程边界：哪些包能 import 什么</li>\n<li>验证：每次改完必须跑 <code>pnpm typecheck &amp;&amp; pnpm test</code></li>\n<li>提交规范：Angular 那套</li>\n</ul>',
    replyTo: 20,
    likes: 15
  },
  { author: '山风', html: '<p>蹲一个新帖</p>' },
  { author: 'long_night', html: `<p>试了一下 worktree 的方案，确实顺很多，感谢楼主 ${emoji('hugs')}</p>`, likes: 2 },
  { author: '老周', html: `<p>有没有遇到过 Codex 改着改着把测试删了的情况 ${emoji('laughing')}</p>` },
  { author: '青柠', html: '<p>遇到过，所以 AGENTS.md 里加了一句：<strong>不许为了让测试通过而删测试</strong>。</p>', replyTo: 24, likes: 7 },
  { author: 'dusk', html: '<p>学习了，建议加精</p>' }
]

const v2exOpening = [
  '<p>3.14 之后 free-threading 算是正式支持了，想问问有没有人在生产里用上的。</p>',
  '<p>我们有个 CPU 密集的服务，现在是 multiprocessing 跑的，内存占用很高。试了下 <code>python3.14t</code>：</p>',
  '<pre><code>$ python3.14t -X gil=0 bench.py\nworkers=8  1.92s\n$ python3.14 bench.py\nworkers=8  7.41s</code></pre>',
  '<p>提升很明显，但是担心 C 扩展的兼容性，numpy 和 orjson 都还好，其他的不确定。</p>',
  '<p>大家有踩过什么坑吗？</p>'
].join('\n')

const v2exReplies: Reply[] = [
  { author: 'pixel', html: '还在观望，等主流库都标了 free-threading wheel 再说' },
  { author: 'nimbus', html: '测过，单线程会慢 10% 左右，要看你的场景', likes: 3 },
  { author: 'snowpea', html: `${v2Mention('nimbus')} 我们是纯多线程场景，单线程慢一点能接受`, replyTo: 2 },
  { author: '大白', html: '踩过一个坑：有些库在 import 的时候会把 GIL 打开，要看启动时有没有 RuntimeWarning<br />可以加 <code>-X gil=0</code> 强制关', likes: 6 },
  { author: '北岛', html: 'mark' },
  { author: 'tinkerer', html: '感觉还早，至少等 3.15' },
  { author: '木子', html: `${v2Mention('大白')} 学到了，之前一直以为是自己代码的问题`, replyTo: 4 },
  { author: 'lemon7', html: '内存问题可以先试试 multiprocessing 的 forkserver，比 fork 省不少' },
  { author: 'snowpea', html: `${v2Mention('lemon7')} 试过，省了 30% 左右，但还是比线程多太多`, replyTo: 8 },
  { author: 'byte', html: '我们上了，跑了两个月没出问题。主要是自己写的代码要注意共享状态，以前靠 GIL 兜底的地方现在都得加锁', likes: 11 },
  { author: 'ohayo', html: `${v2Mention('byte')} 请问加锁之后性能还有优势吗`, replyTo: 10 },
  { author: 'byte', html: `${v2Mention('ohayo')} 有，锁的粒度控制好就行。热点路径上我们换成了 queue`, replyTo: 11, likes: 4 },
  { author: '半糖', html: '<img src="https://cdn3.ldstatic.com/optimized/4X/c/a/7/ca785958d37aba2c5e234af1f4d969945ae87b2f_2_690x388.jpeg" class="embedded_image" rel="noreferrer" /><br />贴个我们的压测图' },
  { author: 'pixel', html: `${v2Mention('半糖')} 这图看不太懂，纵轴是啥`, replyTo: 13 },
  { author: '半糖', html: `${v2Mention('pixel')} QPS，横轴是线程数`, replyTo: 14 },
  { author: '大白', html: 'uv 现在装 free-threading 版本很方便：<br /><code>uv python install 3.14t</code>' },
  { author: 'tinkerer', html: '有没有 benchmark 对比 Go 的？' },
  { author: 'nimbus', html: `${v2Mention('tinkerer')} 别比了，比不过的`, replyTo: 17, likes: 8 },
  { author: '北岛', html: '哈哈哈哈 楼上真相了' },
  { author: 'lemon7', html: '顺便问下，asyncio 在 free-threading 下有变化吗' },
  { author: 'snowpea', html: `${v2Mention('lemon7')} 事件循环还是单线程的，不过可以每个线程一个 loop`, replyTo: 20 },
  { author: 'ohayo', html: '收藏了，回头试试' },
  { author: '木子', html: '感谢楼主分享 benchmark' },
  { author: 'byte', html: '补充一下：pytest-xdist 跟 free-threading 一起用的时候注意一下 fixture 的作用域' },
  { author: 'snowpea', html: '谢谢各位，周末整理一下发个总结帖' }
]

// HTML a forum should never send, to see the sanitizer take it apart: nothing here may run, style
// itself, borrow the page's classes or load anything but an https picture.
const hostileOpening = [
  '<p onclick="alert(1)" style="color:red">脚本、样式和事件都应被去掉<script>alert(1)</script></p>',
  '<p class="chat-user chat-notice">借用页面 class 的段落</p>',
  '<p><img src="x" onerror="alert(1)"><img src="http://example.com/insecure.png"><img src="data:image/png;base64,iVBORw0KGgo="></p>',
  '<p><a href="javascript:alert(1)">javascript 链接</a> · <a href="https://example.com/ok">正常链接</a></p>',
  '<iframe src="https://example.com"></iframe><form action="https://example.com"><input name="q"><button>提交</button></form>',
  '<style>body{display:none}</style><svg><script>alert(1)</script></svg><math><mi>x</mi></math>',
  '<p data-image-chip="https://example.com/x.png">伪造的图片按钮</p>'
].join('\n')

const genericReplies = [
  '<p>插眼，等大佬解答</p>',
  '<p>同问，我也遇到过类似的情况</p>',
  '<p>可以试试先看一下日志，<code>journalctl -u xxx -f</code></p>',
  '<p>感谢分享 ' + emoji('hugs') + '</p>',
  '<p>这个我知道，之前写过一篇总结：</p><ul><li>先确认版本</li><li>再看配置</li><li>最后查网络</li></ul>',
  '<p>前排</p>',
  '<p>学到了，收藏</p>',
  '<p>楼主好人 ' + emoji('laughing') + '</p>'
]
const genericAuthors: Record<CommunityId, string[]> = {
  linuxdo: ['山风', 'long_night', '老周', 'dusk', '一只鹿', '小满', '七月', 'momo'],
  v2ex: ['pixel', 'nimbus', '大白', 'lemon7', 'tinkerer', '木子', 'ohayo', '半糖']
}

function threadParts(community: CommunityId, seed: Seed): { opening: string; replies: Reply[] } {
  if (seed.id === '3200001') return { opening: linuxdoOpening, replies: linuxdoReplies }
  if (seed.id === '1257800') return { opening: v2exOpening, replies: v2exReplies }
  if (seed.id === '3182777') return { opening: hostileOpening, replies: [] }
  const count = Math.min(seed.replies, 12)
  const authors = genericAuthors[community]
  const replies = Array.from({ length: count }, (_, index): Reply => ({
    author: authors[index % authors.length] ?? seed.author,
    html: genericReplies[index % genericReplies.length] ?? '<p>+1</p>',
    likes: index % 3 === 0 ? index : 0
  }))
  return { opening: `<p>${seed.title}</p>\n<p>如题，大家有什么经验？</p>`, replies }
}

// linux.do numbers its opening post 1 and pages by 20; V2EX numbers replies from 1 and gives them all.
const PAGE = 20

export function mockThread(community: CommunityId, id: string, page: number, now: number, added: Post[] = []): Thread {
  const seed = topics[community].find((one) => one.id === id)
  if (!seed) throw new Error(community === 'linuxdo' ? '话题不存在或已被删除' : '主题未找到')
  const topic = toTopic(community, seed, now)
  const { opening, replies } = threadParts(community, seed)
  const first = community === 'linuxdo' ? 2 : 1
  const post = (reply: Reply, index: number): Post => ({
    id: String(90_000 + first + index),
    floor: first + index,
    author: reply.author,
    avatar: avatars[reply.author] ?? null,
    html: reply.html,
    time: now - (replies.length - index) * 7 * 60_000,
    replyTo: reply.replyTo ?? null,
    likes: reply.likes ?? 0,
    liked: false,
    byAuthor: reply.author === seed.author
  })
  const all = [...replies.map(post), ...added]
  topic.replies = all.length
  const openingPost: Post = { id: community === 'v2ex' ? id : String(90_000 + first - 1), floor: first - 1, author: seed.author, avatar: avatars[seed.author] ?? null, html: opening, time: now - (replies.length + 3) * 7 * 60_000, replyTo: null, likes: 4, liked: false, byAuthor: true }
  if (community === 'v2ex') return { topic, opening: page === 1 ? openingPost : null, posts: page === 1 ? all : [], page, more: false }
  // Page 1 holds the opening post and the replies after it, 20 posts in all.
  const start = page === 1 ? 0 : PAGE - 1 + (page - 2) * PAGE
  const end = page === 1 ? PAGE - 1 : start + PAGE
  return { topic, opening: page === 1 ? openingPost : null, posts: all.slice(start, end), page, more: end < all.length }
}
