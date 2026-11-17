import { execFile } from 'node:child_process'

// The proxy the user set for their computer or their shell. A browser follows it and a Node process
// does not: where the forums are only reachable through one, a direct connection times out. The
// rules follow Antumi core's own (system-proxy.ts), so a plugin goes out the way core does.

export type ProxySettings = {
  // An http:// or https:// proxy for https requests, or null to go direct.
  https: string | null
  // Hosts that go direct besides loopback: exact, *-globs, .suffixes, a.b.c.d/n ranges, and <local>.
  bypass: string[]
}
const NONE: ProxySettings = { https: null, bypass: [] }

// Only a proxy spoken to in HTTP can carry a CONNECT; a SOCKS one counts as none.
function proxyAddress(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(address)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.href : null
  } catch {
    return null
  }
}

// HTTPS_PROXY and the like, which a user who sets them means; null when none is set.
export function envProxy(env: Readonly<Record<string, string | undefined>>): ProxySettings | null {
  const read = (name: string) => env[name] ?? env[name.toLowerCase()]
  const named = read('HTTPS_PROXY') ?? read('ALL_PROXY') ?? read('HTTP_PROXY')
  if (!named) return null
  const bypass = (read('NO_PROXY') ?? '').split(',').map((each) => each.trim()).filter(Boolean)
  return { https: proxyAddress(named), bypass }
}

// `scutil --proxy`, macOS's current proxy settings.
export function parseMacProxy(text: string): ProxySettings {
  const value = (key: string) => new RegExp(`^\\s*${key} : (.+)$`, 'm').exec(text)?.[1]?.trim() ?? null
  const host = value('HTTPSProxy')
  const port = value('HTTPSPort')
  const https = value('HTTPSEnable') === '1' && host ? proxyAddress(port ? `${host}:${port}` : host) : null
  const list = /ExceptionsList : <array> \{([^}]*)\}/.exec(text)?.[1] ?? ''
  const bypass = [...list.matchAll(/^\s*\d+ : (.+)$/gm)].flatMap((match) => match[1] ? [match[1].trim()] : [])
  if (value('ExcludeSimpleHostnames') === '1') bypass.push('<local>')
  return { https, bypass }
}

// `reg query` of Internet Settings. ProxyServer is one host:port for every scheme, or
// scheme=host:port pairs.
export function parseWindowsProxy(text: string): ProxySettings {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+REG_\w+\s+(.*)$/.exec(line)
    if (match?.[1] && match[2] !== undefined) values.set(match[1], match[2].trim())
  }
  if (Number(values.get('ProxyEnable') ?? '0') === 0) return NONE
  const server = values.get('ProxyServer') ?? ''
  const bypass = (values.get('ProxyOverride') ?? '').split(';').map((each) => each.trim()).filter(Boolean)
  if (!server.includes('=')) return { https: proxyAddress(server), bypass }
  const schemes = new Map(server.split(';').map((pair) => pair.split('=')).flatMap(([scheme, address]) => scheme && address ? [[scheme.trim().toLowerCase(), address] as const] : []))
  return { https: proxyAddress(schemes.get('https') ?? schemes.get('http')), bypass }
}

function loopback(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]' || /^127\./.test(host)
}

function ipv4(text: string): number | null {
  const parts = text.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null
  return parts.reduce((value, part) => value * 256 + Number(part), 0)
}

// 10.0.0.0/8 and the like, as macOS lists private ranges.
function inRange(host: string, pattern: string): boolean {
  const [base, bits] = pattern.split('/')
  const address = ipv4(host)
  const network = base ? ipv4(base) : null
  const size = Number(bits)
  if (address === null || network === null || !Number.isInteger(size) || size < 0 || size > 32) return false
  const block = 2 ** (32 - size)
  return Math.floor(address / block) === Math.floor(network / block)
}

export function bypassed(host: string, bypass: readonly string[]): boolean {
  const name = host.toLowerCase()
  if (loopback(name)) return true
  return bypass.some((entry) => {
    const pattern = entry.toLowerCase()
    if (pattern === '*') return true
    if (pattern === '<local>') return !name.includes('.')
    if (pattern.includes('/')) return inRange(name, pattern)
    if (pattern.includes('*')) return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(name)
    const bare = pattern.replace(/^\./, '')
    return name === bare || name.endsWith(`.${bare}`)
  })
}

export type ProxyHost = {
  platform: NodeJS.Platform
  env: Readonly<Record<string, string | undefined>>
  run(command: string, args: string[]): Promise<string>
}
const thisHost: ProxyHost = {
  platform: process.platform,
  env: process.env,
  run: (command, args) => new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 3000, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout))
  })
}

// The environment first, as the user who sets it means it; then what the system says.
export async function readProxySettings(host: ProxyHost = thisHost): Promise<ProxySettings> {
  const fromEnv = envProxy(host.env)
  if (fromEnv) return fromEnv
  try {
    // By full path: the plugin's PATH is whatever started Antumi.
    if (host.platform === 'darwin') return parseMacProxy(await host.run('/usr/sbin/scutil', ['--proxy']))
    if (host.platform === 'win32') return parseWindowsProxy(await host.run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings']))
  } catch { /* No readable setting: go direct. */ }
  return NONE
}

// Asked once: the process lives for one call, and its settings do not change under it.
let settings: Promise<ProxySettings> | undefined

// The proxy a request to this address goes through, or null to go direct.
export async function proxyFor(url: URL): Promise<string | null> {
  if (url.protocol !== 'https:' || loopback(url.hostname.toLowerCase())) return null
  settings ??= readProxySettings()
  const current = await settings
  return bypassed(url.hostname, current.bypass) ? null : current.https
}
