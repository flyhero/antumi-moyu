import { execFileSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const tag = process.argv[2] ?? ''
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (tag !== `v${pkg.version}`) throw new Error(`tag ${tag} does not match version ${pkg.version}`)
const archive = path.join(root, 'dist', `${pkg.name}-${pkg.version}.zip`)
await access(archive)
// Users install from the repository's latest release, so a prerelease must not become it.
const prerelease = pkg.version.includes('-')
execFileSync('gh', ['release', 'create', tag, archive, '--verify-tag', '--title', `${pkg.name} ${tag}`, '--notes-file', path.join(root, 'CHANGELOG.md'), ...(prerelease ? ['--prerelease', '--latest=false'] : [])], { stdio: 'inherit' })
