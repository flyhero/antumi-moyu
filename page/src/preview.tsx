import { mockHost } from './mock-host'
import { start } from './start'

// The page opened as a plain web page (npm run preview): a mock stands in for Antumi.
start(mockHost())
