import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const version = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8')).version as string

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Délais larges : la machine de fabrication de GitHub est plus lente que la nôtre (un test trivial a déjà dépassé 5 s).
  test: { environment: 'node', testTimeout: 30000, hookTimeout: 30000 },
})
