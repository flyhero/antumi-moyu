import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { zipSync } from 'fflate'

const root = path.resolve(import.meta.dirname, '..')
// --page builds the page alone with a mock in Antumi's place, for the preview.
const pageOnly = process.argv.includes('--page')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const dist = path.join(root, 'dist')
await rm(dist, { recursive: true, force: true })

// One page for every plugin. The frame loads classic scripts only: a module script is fetched with
// CORS, which the frame's opaque origin fails. The stylesheet the script imports comes out beside
// it as app.css.
const page = path.join(dist, 'page')
await mkdir(page, { recursive: true })
await build({
  entryPoints: [path.join(root, pageOnly ? 'page/src/preview.tsx' : 'page/src/main.tsx')], outfile: path.join(page, 'app.js'),
  bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', minify: true, legalComments: 'none',
  jsx: 'automatic', jsxImportSource: 'preact'
})
await copyFile(path.join(root, 'page/index.html'), path.join(page, 'index.html'))

if (pageOnly) {
  console.log('Built dist/page')
} else {
  const { PluginManifest } = await import('@antumi/plugin-sdk')
  // A plugin for each forum (plugins/<name>): its own id and backend, the same page, one version.
  for (const name of (await readdir(path.join(root, 'plugins'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`plugins/${name} is not a safe name`)
    const manifest = JSON.parse(await readFile(path.join(root, 'plugins', name, 'manifest.json'), 'utf8'))
    PluginManifest.parse(manifest)
    if (manifest.version !== pkg.version) throw new Error(`plugins/${name}/manifest.json must have package.json's version`)
    if (manifest.entry.main !== 'main.mjs') throw new Error(`plugins/${name}/manifest.json entry.main must be main.mjs`)
    const artifact = path.join(dist, name)
    await mkdir(path.join(artifact, 'page'), { recursive: true })
    await build({ entryPoints: [path.join(root, 'plugins', name, 'main.ts')], outfile: path.join(artifact, 'main.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' })
    await writeFile(path.join(artifact, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    const files = { 'main.mjs': new Uint8Array(await readFile(path.join(artifact, 'main.mjs'))), 'manifest.json': new Uint8Array(await readFile(path.join(artifact, 'manifest.json'))) }
    for (const file of (await readdir(page)).sort()) {
      await copyFile(path.join(page, file), path.join(artifact, 'page', file))
      files[`page/${file}`] = new Uint8Array(await readFile(path.join(page, file)))
    }
    // No version in the name: Antumi finds a plugin's update by this name in the newest release.
    const archive = `${pkg.name}-${name}.zip`
    // Rebuilding identical inputs must preserve the archive checksum.
    await writeFile(path.join(dist, archive), zipSync(files, { mtime: new Date(1980, 0, 1) }))
    console.log(`Built dist/${archive} (${manifest.id} ${manifest.version})`)
  }
}
