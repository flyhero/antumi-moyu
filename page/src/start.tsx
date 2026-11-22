import { render } from 'preact'
import './app.css'
import { App } from './components/App'
import type { PageHost } from './host'
import { forumRequests } from './forum-requests'

// The page, once it has a host to talk to.
export function start(host: PageHost): void {
  const root = document.getElementById('app')
  if (root) {
    const requests = forumRequests(host)
    window.addEventListener('pagehide', requests.dispose, { once: true })
    render(<App host={requests.host} />, root)
  }
}
