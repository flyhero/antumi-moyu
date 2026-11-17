import { runPlugin } from '@antumi/plugin-sdk'
import manifest from '../manifest.json' with { type: 'json' }
import { reader } from './reader.js'

runPlugin({ manifest, pages: { reader } })
