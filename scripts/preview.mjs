// The page in a plain browser, against the mock host: builds it, then serves dist/page on
// http://127.0.0.1:4173. Each load of the page rebuilds it first, so a reload shows the latest code.
// It is served as Antumi frames it, under the same CSP and as a sandbox with an opaque origin, so
// what breaks there (a fetch, localStorage, an inline script) breaks here too.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const served = path.join(root, 'dist', 'page')
const port = Number(process.env.PORT ?? 4173)
const origin = `http://127.0.0.1:${port}`

// Antumi's policy, with its antumi-plugin: scheme read as this server.
const policy = [
  "default-src 'none'",
  `script-src ${origin}`,
  `style-src ${origin} 'unsafe-inline'`,
  `img-src ${origin} https: data: blob:`,
  "connect-src 'none'",
  "frame-src 'none'",
  'sandbox allow-scripts'
].join('; ')

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

function build() {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs'), '--page'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] })
}

build()

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', origin).pathname
  const name = pathname === '/' ? 'index.html' : pathname.slice(1)
  if (!/^[a-z0-9._-]+$/i.test(name) || !Object.hasOwn(types, path.extname(name))) {
    response.writeHead(404).end()
    return
  }
  try {
    if (name === 'index.html') build()
    const body = await readFile(path.join(served, name))
    response.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Content-Security-Policy': policy, 'Cache-Control': 'no-store' })
    response.end(body)
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stderr ?? ''}` : String(error)
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message)
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Preview on ${origin}/  (?theme=dark  ?lang=en  ?slow=1500  ?error=list|thread|communities|all|once; Alt+T flips the theme)`)
})
