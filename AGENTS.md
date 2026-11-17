# Antumi Moyu

An Antumi plugin with one page: forum threads from linux.do and V2EX, drawn to look like Antumi's AI chat.

- `src/` is the backend, a Node process Antumi starts for each call from the page: it fetches the forums and returns one shape for both (`src/community.ts`). It keeps nothing between calls.
- `page/` is the page, shown in a sandboxed frame: it cannot reach the network, only its own backend through the SDK's bridge (`page/src/host.ts`). It is built into one classic script and one stylesheet; no ES modules, no inline scripts, no fonts.
- A community is one file in `src/communities/`. Anonymous and read-only: no login, no posting.
- Forum HTML is untrusted: the page sanitizes it before showing it, and links open through the host.
- Ask the forums for little: one request per thing the user does, no background refresh, no retry loops. Say plainly when a forum refuses.
- Pass the AbortSignal through every request. stdout belongs to the SDK; logs go to stderr.
- The page uses the host's theme tokens (`--bg`, `--text`, …) and never hard-codes a colour.
- Tests use saved responses in `src/fixtures/`; they never touch the network.
- Run `npm run check` before committing. `package.json` and `manifest.json` carry the same version; a release is the tag `v<version>`.
- Commit as `flyhero <qfwang666@163.com>`, conventional commits with a body that says what changes for the user.
- Do not push a release tag unless the user asks.
