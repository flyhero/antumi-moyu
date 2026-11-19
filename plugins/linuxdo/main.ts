import { runPlugin } from '@antumi/plugin-sdk'
import { makeBrowserReader } from '../../src/browser-reader.js'
import manifest from './manifest.json' with { type: 'json' }

runPlugin({ manifest, pages: { reader: makeBrowserReader('linuxdo') } })
