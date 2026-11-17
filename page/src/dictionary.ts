import type { PageHost } from './host'

// Every word the page shows, in the app's two languages.
const zh = {
  newChat: '新会话',
  conversations: '会话',
  channel: '频道',
  loading: '加载中…',
  listFailed: '列表没有取到',
  empty: '这里还没有话题',
  replies: (count: number) => `${count} 回复`,
  thinking: '思考中…',
  replying: '正在回复…',
  retry: '重试',
  loadMore: '加载更多回复',
  page: (page: number) => `第 ${page} 页`,
  quote: '引用',
  quoteOf: (name: string) => `引用 @${name}`,
  details: '详情',
  image: '图片',
  expand: '展开全文',
  collapse: '收起',
  replyTo: (floor: number, name: string | null) => (name ? `回复 #${floor} @${name}` : `回复 #${floor}`),
  notLoaded: '这一楼还没加载',
  likes: (count: number) => `${count} 个赞`,
  refresh: '刷新（r）',
  openInBrowser: '在浏览器打开（o）',
  run: '运行（Enter）',
  placeholder: '输入命令：n 下一页 · r 刷新 · o 浏览器打开 · q 离开 · /频道 · 楼层号 · ? 帮助',
  stream: (on: boolean) => `流式输出：${on ? '开' : '关'}`,
  images: (show: boolean) => `图片：${show ? '显示' : '折叠'}`,
  assistant: '助手',
  help: '我可以帮你做这些事，在下面输入命令后回车：',
  unknown: (text: string) => `没听懂「${text}」。可以这样说：`,
  noChannel: (name: string, names: string) => `没有「${name}」这个频道。可选：${names}`,
  noMore: '已经是最后一页了。',
  noTopic: '先在左边选一个话题。',
  floorMissing: (floor: number) => `第 ${floor} 楼不在已加载的内容里，可以用 n 往后翻。`,
  commandsTitle: ['命令', '作用'],
  commands: [
    ['n', '下一页'],
    ['r', '刷新列表和当前话题'],
    ['o', '在浏览器打开当前话题'],
    ['q', '离开（也可连按两次 Esc）'],
    ['/linuxdo  /v2ex', '切换社区'],
    ['/latest  /hot  /python …', '切换频道（频道 id 或名字）'],
    ['12', '跳到第 12 楼'],
    ['j / k', '下一个 / 上一个话题（不在输入框里时）']
  ],
  greeting: '有什么可以帮你的？'
}

type Words = typeof zh

const en: Words = {
  newChat: 'New chat',
  conversations: 'Chats',
  channel: 'Channel',
  loading: 'Loading…',
  listFailed: 'The list did not load',
  empty: 'Nothing here yet',
  replies: (count) => (count === 1 ? '1 reply' : `${count} replies`),
  thinking: 'Thinking…',
  replying: 'Replying…',
  retry: 'Retry',
  loadMore: 'Load more replies',
  page: (page) => `Page ${page}`,
  quote: 'Quote',
  quoteOf: (name) => `Quoting @${name}`,
  details: 'Details',
  image: 'Image',
  expand: 'Show all',
  collapse: 'Show less',
  replyTo: (floor, name) => (name ? `Re #${floor} @${name}` : `Re #${floor}`),
  notLoaded: 'This floor is not loaded yet',
  likes: (count) => (count === 1 ? '1 like' : `${count} likes`),
  refresh: 'Refresh (r)',
  openInBrowser: 'Open in browser (o)',
  run: 'Run (Enter)',
  placeholder: 'Type a command: n next page · r refresh · o open · q leave · /channel · floor number · ? help',
  stream: (on) => `Streaming: ${on ? 'on' : 'off'}`,
  images: (show) => `Images: ${show ? 'shown' : 'folded'}`,
  assistant: 'Assistant',
  help: 'Here is what I can do. Type a command below and press Enter:',
  unknown: (text) => `I did not get "${text}". Try one of these:`,
  noChannel: (name, names) => `There is no channel "${name}". Try: ${names}`,
  noMore: 'This is the last page.',
  noTopic: 'Pick a topic on the left first.',
  floorMissing: (floor) => `Floor ${floor} is not loaded; n loads the next page.`,
  commandsTitle: ['Command', 'What it does'],
  commands: [
    ['n', 'Next page'],
    ['r', 'Refresh the list and this topic'],
    ['o', 'Open this topic in the browser'],
    ['q', 'Leave (or press Esc twice)'],
    ['/linuxdo  /v2ex', 'Switch community'],
    ['/latest  /hot  /python …', 'Switch channel, by id or name'],
    ['12', 'Jump to floor 12'],
    ['j / k', 'Next / previous topic, outside the input']
  ],
  greeting: 'What can I help you with?'
}

export type { Words }

export function dictionary(locale: PageHost['locale']): Words {
  return locale === 'zh-CN' ? zh : en
}
