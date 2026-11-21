# Antumi Moyu

Two Antumi plugins, one for linux.do and one for V2EX, each with one page: the forum's threads drawn to look like Antumi's AI chat. They are installed separately and built from the same code.

- `plugins/<forum>/` is one plugin: its manifest (its own id and sidebar label) and its entry, which names the forums it reads. Everything else is shared, and both plugins carry one version.
- `src/` is the backend, a Node process Antumi starts for each call from the page: it fetches the forums and returns one shape for both (`src/community.ts`). It keeps nothing between calls.
- `page/` is the page, shown in a sandboxed frame: it cannot reach the network, only its own backend through the SDK's bridge (`page/src/main.tsx`; `preview.tsx` puts a mock in its place for `npm run preview`). It is built into one classic script and one stylesheet; no ES modules, no inline scripts, no fonts.
- Communities live in `src/communities/`. The page shows whichever the backend lists, and offers to switch only when there is more than one. Anonymous reading uses public endpoints; authenticated reading and explicit replies use the host's isolated browser sessions (`src/browser-reader.ts`, `src/forum-session.ts`).
- Forum HTML is untrusted: the page sanitizes it before showing it, and links open through the host.
- Ask the forums for little: one request per thing the user does, plus one refresh when a visible list's 3-minute cache expires. Hidden pages wait until visible; failed requests never retry automatically. Say plainly when a forum refuses.
- Anonymous requests follow the user's proxy (`src/proxy.ts`: the environment first, then the system's setting, by the same rules as Antumi core), through a CONNECT tunnel (`src/tunnel.ts`). Authenticated requests follow the built-in browser's proxy settings.
- Anonymous requests go out over HTTP/2 (`src/http.ts`), never Node `fetch`: linux.do's Cloudflare challenges HTTP/1.1 clients. Authenticated requests use SDK `context.browser`, never Cookie strings or the page's saved state. linux.do's avatars and emoji are handed out from its CDN, since its own host refuses to show them in another page.
- Drafts and reading positions share the host's 32 KiB page state with preferences through one writer. Never silently truncate or evict a draft; show storage failures. Persist the unknown-outcome guard before starting a send.
- Notifications use the same isolated session. Never fetch them anonymously or persist their contents. linux.do follows its MessageBus notification channel while the page is visible, reading the home page once for the stream's address and handing it back from the page's memory on each poll (never into saved state); V2EX checks its unread count every 3 minutes and on returning to the page. V2EX clears its unread count on viewing the list; linux.do read changes require the explicit check button and a confirmed server response.
- Reply only when the user clicks Send or presses Enter outside IME composition; Meta (Win/Command) + Enter inserts a new line. Ignore repeated Enter keydown events and preserve the same send guards for both actions. Fetch fresh CSRF/once before sending, preserve drafts on failure, and never automatically retry a write whose outcome is unknown.
- The preview's data (`page/src/mock-data.ts`) is made up: no real names or avatars under invented posts.
- Pass the AbortSignal through every request. stdout belongs to the SDK; logs go to stderr.
- The page uses the host's theme tokens (`--bg`, `--text`, …) and never hard-codes a colour.
- Tests use saved responses in `src/fixtures/`; they never touch the network.
- Run `npm run check` before committing. `package.json` and every `plugins/*/manifest.json` carry the same version; a release is the tag `v<version>`, with both ZIPs on it. A ZIP's name has no version in it: Antumi finds a plugin's update by that name.
- Commit as `flyhero <qfwang666@163.com>`, conventional commits with a body that says what changes for the user.
- Do not push a release tag unless the user asks.
