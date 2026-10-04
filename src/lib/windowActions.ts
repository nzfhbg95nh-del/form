import { isTauri } from './repo'

type Win = { minimize(): Promise<void>; toggleMaximize(): Promise<void>; isFullscreen(): Promise<boolean>; setFullscreen(v: boolean): Promise<void>; close(): Promise<void> }

async function appWindow(): Promise<Win | null> {
  if (!isTauri()) return null
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow() as unknown as Win
}

/** Actions sur la fenêtre de l'application. Renvoie false si on est dans un navigateur (essais). */
export const windowActions = {
  async minimize() { const w = await appWindow(); if (!w) return false; await w.minimize(); return true },
  async toggleMaximize() { const w = await appWindow(); if (!w) return false; await w.toggleMaximize(); return true },
  async toggleFullscreen() {
    const w = await appWindow()
    if (w) { await w.setFullscreen(!(await w.isFullscreen())); return true }
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
    return true
  },
  async quit() { const w = await appWindow(); if (!w) return false; await w.close(); return true },
}

/** Copie un texte dans le presse-papiers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Lien interne vers une page de Form (à coller dans la recherche Ctrl+K). */
export const pageLink = (id: string) => `form://page/${id}`
export const parsePageLink = (text: string): string | null => /^form:\/\/page\/([\w-]+)$/.exec(text.trim())?.[1] ?? null
