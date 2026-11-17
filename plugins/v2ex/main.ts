import { runPlugin } from '@antumi/plugin-sdk'
import { v2ex } from '../../src/communities/v2ex.js'
import { makeReader } from '../../src/reader.js'
import manifest from './manifest.json' with { type: 'json' }

runPlugin({ manifest, pages: { reader: makeReader([v2ex()]) } })
