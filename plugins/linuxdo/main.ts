import { runPlugin } from '@antumi/plugin-sdk'
import { linuxdo } from '../../src/communities/linuxdo.js'
import { makeReader } from '../../src/reader.js'
import manifest from './manifest.json' with { type: 'json' }

runPlugin({ manifest, pages: { reader: makeReader([linuxdo()]) } })
