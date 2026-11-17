import type { PageTheme } from './host'

// The tokens Antumi's SDK hands the page, as its default palette (赤陶) gives them in light and dark:
// the two halves of each light-dark() in the app's styles.css.
const shared: Record<string, string> = {
  '--warning': '#c79a1c',
  '--radius': '8px',
  '--radius-sm': '6px',
  '--radius-xs': '4px',
  '--radius-lg': '12px',
  '--font': "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  '--mono': "'Geist Mono Variable', Menlo, Consolas, 'PingFang SC', 'Microsoft YaHei', monospace",
  '--page-reading': '800px',
  '--chat-font-size': '14px',
  '--chat-font-small': '12px',
  '--chat-width': '800px'
}

const light: Record<string, string> = {
  '--bg': '#f8f8f8',
  '--surface': '#ffffff',
  '--fill': 'rgb(0 0 0 / 3%)',
  '--fill-2': 'rgb(0 0 0 / 6%)',
  '--border': '#eeeeee',
  '--border-2': '#e3e3e3',
  '--text': '#080808',
  '--text-muted': '#666666',
  '--text-3': '#999999',
  '--accent': '#c2542d',
  '--accent-bg': 'rgb(194 84 45 / 9%)',
  '--accent-text': '#ffffff',
  '--focus': '#c2542d55',
  '--info': '#0072f5',
  '--danger': '#b3261e'
}

const dark: Record<string, string> = {
  '--bg': '#000000',
  '--surface': '#0d0d0d',
  '--fill': 'rgb(255 255 255 / 6%)',
  '--fill-2': 'rgb(255 255 255 / 10%)',
  '--border': '#1a1a1a',
  '--border-2': '#202020',
  '--text': '#ffffff',
  '--text-muted': '#aaaaaa',
  '--text-3': '#6f6f6f',
  '--accent': '#e0754c',
  '--accent-bg': 'rgb(224 117 76 / 14%)',
  '--accent-text': '#1a0f0a',
  '--focus': '#e0754c55',
  '--info': '#60b1ff',
  '--danger': '#ef6b62'
}

export function mockTheme(scheme: PageTheme['scheme']): PageTheme {
  return { scheme, variables: { ...shared, ...(scheme === 'dark' ? dark : light) } }
}
