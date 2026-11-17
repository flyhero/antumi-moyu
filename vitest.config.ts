import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['src/**/*.test.ts', 'page/src/**/*.test.ts'], environment: 'node' } })
