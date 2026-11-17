import { render } from 'preact'
import './app.css'
import { App } from './components/App'
import type { PageHost } from './host'

// The page, once it has a host to talk to.
export function start(host: PageHost): void {
  const root = document.getElementById('app')
  if (root) render(<App host={host} />, root)
}
