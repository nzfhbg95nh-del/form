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
  test: { environment: 'node' },
})
