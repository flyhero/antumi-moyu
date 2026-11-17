import { connect } from '@antumi/plugin-sdk/page'
import { start } from './start'

// In Antumi the host is the SDK's bridge to the app framing the page. Without it there is nothing
// to show and no one to tell, so a failure only reaches the console.
connect().then(start, (error: unknown) => console.error(error))
