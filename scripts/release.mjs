import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const tag = process.argv[2] ?? ''
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (tag !== `v${pkg.version}`) throw new Error(`tag ${tag} does not match version ${pkg.version}`)
// Every plugin's ZIP on the one release: a user names the one they want when installing.
const archives = (await readdir(path.join(root, 'dist'))).filter((name) => name.endsWith('.zip')).sort().map((name) => path.join(root, 'dist', name))
if (archives.length === 0) throw new Error('nothing built: run npm run build first')
// Users install from the repository's latest release, so a prerelease must not become it.
const prerelease = pkg.version.includes('-')
execFileSync('gh', ['release', 'create', tag, ...archives, '--verify-tag', '--title', `${pkg.name} ${tag}`, '--notes-file', path.join(root, 'CHANGELOG.md'), ...(prerelease ? ['--prerelease', '--latest=false'] : [])], { stdio: 'inherit' })
