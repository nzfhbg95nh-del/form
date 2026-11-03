import { defineConfig } from '@playwright/test'

// Tests de bout en bout : l'application tourne dans Microsoft Edge (déjà installé sous Windows, rien à télécharger).
// Le navigateur n'a pas la partie Windows de Form (Tauri) : ces tests couvrent les pages, blocs, clavier, moodboards, clients, recherche, corbeille.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:1421', channel: 'msedge', headless: true, viewport: { width: 1280, height: 800 }, locale: 'fr-FR' },
  webServer: { command: 'npx vite --port 1421 --strictPort', url: 'http://localhost:1421', reuseExistingServer: true, timeout: 60_000 },
})