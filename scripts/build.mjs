import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { zipSync } from 'fflate'

const root = path.resolve(import.meta.dirname, '..')
// --page builds the page alone with a mock in Antumi's place, for the preview.
const pageOnly = process.argv.includes('--page')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
if (pkg.version !== manifest.version) throw new Error('package.json and manifest.json must have the same version')
if (manifest.entry?.main !== 'main.mjs') throw new Error('manifest entry.main must be main.mjs')
if (!/^[a-z0-9][a-z0-9._-]*$/.test(pkg.name)) throw new Error('package name is not a safe file name')

const artifact = path.join(root, 'dist', 'plugin')
await rm(artifact, { recursive: true, force: true })
await mkdir(path.join(artifact, 'page'), { recursive: true })
// The frame loads classic scripts only: a module script is fetched with CORS, which the frame's
// opaque origin fails. The stylesheet the script imports comes out beside it as app.css.
await build({
  entryPoints: [path.join(root, pageOnly ? 'page/src/preview.tsx' : 'page/src/main.tsx')], outfile: path.join(artifact, 'page/app.js'),
  bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', minify: true, legalComments: 'none',
  jsx: 'automatic', jsxImportSource: 'preact'
})
await copyFile(path.join(root, 'page/index.html'), path.join(artifact, 'page/index.html'))

if (!pageOnly) {
  const { PluginManifest } = await import('@antumi/plugin-sdk')
  PluginManifest.parse(manifest)
  await build({ entryPoints: [path.join(root, 'src/main.ts')], outfile: path.join(artifact, 'main.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' })
  await writeFile(path.join(artifact, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const files = {}
  for (const name of (await readdir(artifact, { recursive: true })).sort()) {
    const file = path.join(artifact, name)
    if ((await readdir(path.dirname(file), { withFileTypes: true })).find((entry) => entry.name === path.basename(file))?.isFile()) {
      files[name.split(path.sep).join('/')] = new Uint8Array(await readFile(file))
    }
  }
  const archive = `${pkg.name}-${pkg.version}.zip`
  // Rebuilding identical inputs must preserve the archive checksum.
  await writeFile(path.join(root, 'dist', archive), zipSync(files, { mtime: new Date(1980, 0, 1) }))
  console.log(`Built dist/${archive}`)
} else {
  console.log('Built dist/plugin/page')
}
