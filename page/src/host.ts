// The page's way out of its frame: its own backend, the app's look, and the few things the app does
// for it. In Antumi this is the SDK's bridge; opened as a plain web page (the preview) it is a mock.

export type PageTheme = { scheme: 'light' | 'dark'; variables: Record<string, string> }

export type PageHost = {
  call<T = unknown>(method: string, params?: unknown): Promise<T>
  readonly theme: PageTheme
  readonly locale: 'zh-CN' | 'en'
  // What the page kept last time, null if nothing.
  readonly state: unknown
  setState(value: unknown): void
  onTheme(listener: (theme: PageTheme) => void): () => void
  open(url: string): void
  leave(): void
}
