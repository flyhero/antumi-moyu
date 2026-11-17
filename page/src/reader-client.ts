import type { ReaderMethods } from '../../src/community'
import type { PageHost } from './host'

// The backend's methods, typed by the contract both sides import.
export function callReader<M extends keyof ReaderMethods>(host: PageHost, method: M, params: ReaderMethods[M]['params']): Promise<ReaderMethods[M]['result']> {
  return host.call<ReaderMethods[M]['result']>(method, params)
}

// What a failed call says, as it says it: the backend words its refusals for the user.
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return String(error)
}
