import { describe, expect, it } from 'vitest'
import { bypassed, envProxy, parseMacProxy, parseWindowsProxy, readProxySettings } from './proxy.js'
import type { ProxyHost } from './proxy.js'

const mac = (lines: string) => `<dictionary> {\n  ExceptionsList : <array> {\n    0 : 127.0.0.1\n    1 : 192.168.0.0/16\n    2 : *.local\n    3 : <local>\n  }\n${lines}\n}\n`
const windows = (values: Record<string, string>) => ['', 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
  ...Object.entries(values).map(([name, value]) => `    ${name}    ${name === 'ProxyEnable' ? 'REG_DWORD' : 'REG_SZ'}    ${value}`), ''].join('\r\n')

describe('envProxy', () => {
  it('reads HTTPS_PROXY first, then ALL_PROXY and HTTP_PROXY, in either case', () => {
    expect(envProxy({ HTTPS_PROXY: 'http://127.0.0.1:7890', HTTP_PROXY: 'http://other:1' })?.https).toBe('http://127.0.0.1:7890/')
    expect(envProxy({ https_proxy: '127.0.0.1:7890' })?.https).toBe('http://127.0.0.1:7890/')
    expect(envProxy({ ALL_PROXY: 'http://127.0.0.1:1087' })?.https).toBe('http://127.0.0.1:1087/')
    expect(envProxy({ HTTP_PROXY: 'http://127.0.0.1:8080' })?.https).toBe('http://127.0.0.1:8080/')
    expect(envProxy({ PATH: '/usr/bin' })).toBeNull()
  })

  it('counts a SOCKS proxy as none, and keeps NO_PROXY', () => {
    expect(envProxy({ ALL_PROXY: 'socks5://127.0.0.1:1080' })).toEqual({ https: null, bypass: [] })
    expect(envProxy({ HTTPS_PROXY: 'http://p:1', NO_PROXY: 'localhost, .corp.example ,10.0.0.0/8' })?.bypass).toEqual(['localhost', '.corp.example', '10.0.0.0/8'])
  })
})

describe('parseMacProxy', () => {
  it('reads the https proxy when it is on, with the exceptions', () => {
    const settings = parseMacProxy(mac('  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n  HTTPEnable : 1\n  HTTPPort : 7890\n  HTTPProxy : 127.0.0.1'))
    expect(settings.https).toBe('http://127.0.0.1:7890/')
    expect(settings.bypass).toEqual(['127.0.0.1', '192.168.0.0/16', '*.local', '<local>'])
  })

  it('goes direct when it is off, or only SOCKS or a PAC script is set', () => {
    expect(parseMacProxy(mac('  HTTPEnable : 0\n  HTTPSEnable : 0\n  ProxyAutoConfigEnable : 0\n  SOCKSEnable : 0')).https).toBeNull()
    expect(parseMacProxy(mac('  HTTPSEnable : 0\n  HTTPSProxy : 127.0.0.1\n  HTTPSPort : 7890')).https).toBeNull()
    expect(parseMacProxy(mac('  SOCKSEnable : 1\n  SOCKSPort : 1080\n  SOCKSProxy : 127.0.0.1')).https).toBeNull()
  })
})

describe('parseWindowsProxy', () => {
  it('reads one server for every scheme, or the https one of several', () => {
    expect(parseWindowsProxy(windows({ ProxyEnable: '0x1', ProxyServer: '127.0.0.1:7890', ProxyOverride: 'localhost;*.corp;<local>' }))).toEqual({ https: 'http://127.0.0.1:7890/', bypass: ['localhost', '*.corp', '<local>'] })
    expect(parseWindowsProxy(windows({ ProxyEnable: '0x1', ProxyServer: 'http=127.0.0.1:8080;https=127.0.0.1:8443' })).https).toBe('http://127.0.0.1:8443/')
    expect(parseWindowsProxy(windows({ ProxyEnable: '0x1', ProxyServer: 'socks=127.0.0.1:1080' })).https).toBeNull()
  })

  it('goes direct when the proxy is off', () => {
    expect(parseWindowsProxy(windows({ ProxyEnable: '0x0', ProxyServer: '127.0.0.1:7890' })).https).toBeNull()
  })
})

describe('bypassed', () => {
  it('always sends loopback direct', () => {
    for (const host of ['localhost', '127.0.0.1', 'app.localhost', '[::1]']) expect(bypassed(host, [])).toBe(true)
  })

  it('matches names, suffixes, globs, ranges and simple hostnames', () => {
    const list = ['v2ex.com', '.internal.example', '*.local', '10.0.0.0/8', '<local>']
    expect(bypassed('www.v2ex.com', list)).toBe(true)
    expect(bypassed('a.internal.example', list)).toBe(true)
    expect(bypassed('printer.local', list)).toBe(true)
    expect(bypassed('10.2.3.4', list)).toBe(true)
    expect(bypassed('intranet', list)).toBe(true)
    expect(bypassed('linux.do', list)).toBe(false)
    expect(bypassed('notv2ex.com', list)).toBe(false)
    expect(bypassed('linux.do', ['*'])).toBe(true)
  })
})

describe('readProxySettings', () => {
  const host = (platform: NodeJS.Platform, env: Record<string, string>, output: string | Error): ProxyHost & { ran: string[] } => {
    const ran: string[] = []
    return { platform, env, ran, run: async (command) => { ran.push(command); if (output instanceof Error) throw output; return output } }
  }

  it('lets the environment win without asking the system', async () => {
    const asked = host('darwin', { HTTPS_PROXY: 'http://127.0.0.1:1' }, mac('  HTTPSEnable : 1\n  HTTPSPort : 2\n  HTTPSProxy : 127.0.0.1'))
    expect((await readProxySettings(asked)).https).toBe('http://127.0.0.1:1/')
    expect(asked.ran).toEqual([])
  })

  it('asks macOS and Windows for their setting', async () => {
    const onMac = host('darwin', {}, mac('  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1'))
    expect((await readProxySettings(onMac)).https).toBe('http://127.0.0.1:7890/')
    expect(onMac.ran).toEqual(['/usr/sbin/scutil'])
    const onWindows = host('win32', {}, windows({ ProxyEnable: '0x1', ProxyServer: '127.0.0.1:7890' }))
    expect((await readProxySettings(onWindows)).https).toBe('http://127.0.0.1:7890/')
  })

  it('goes direct on Linux without the environment, and when the system cannot be asked', async () => {
    expect(await readProxySettings(host('linux', {}, ''))).toEqual({ https: null, bypass: [] })
    expect(await readProxySettings(host('darwin', {}, new Error('no scutil')))).toEqual({ https: null, bypass: [] })
  })
})
