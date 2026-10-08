import { isTauri } from './repo'

/** Une version plus récente de Form, prête à être installée. */
export interface AvailableUpdate {
  version: string
  notes: string
  /** Télécharge et installe, puis redémarre l'application. `onProgress` reçoit un pourcentage (0 à 100) quand il est connu. */
  install(onProgress?: (percent: number | null) => void): Promise<void>
}

declare global {
  interface Window {
    /** Essais dans le navigateur uniquement : simule une version disponible (ou aucune). */
    __FORM_UPDATE_MOCK?: () => Promise<{ version: string; notes?: string } | null>
  }
}

/** Compare deux numéros de version « 1.2.3 » : positif si a est plus récent que b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Vrai si la version annoncée est strictement plus récente que celle qui tourne. */
export const isNewer = (candidate: string, current: string) => compareVersions(candidate, current) > 0

/** Cherche une mise à jour (la vérification se fait auprès du dépôt public des installateurs). Renvoie null s'il n'y en a pas. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) {
    const mock = window.__FORM_UPDATE_MOCK
    const found = mock ? await mock() : null
    return found ? { version: found.version, notes: found.notes ?? '', install: async () => undefined } : null
  }
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) return null
  return {
    version: update.version,
    notes: update.body ?? '',
    async install(onProgress) {
      let total = 0
      let done = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        else if (event.event === 'Progress') {
          done += event.data.chunkLength
          onProgress?.(total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null)
        } else if (event.event === 'Finished') onProgress?.(100)
      })
      // L'installateur Windows relance déjà l'application ; ceci couvre le cas où elle resterait ouverte.
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('restart_app')
    },
  }
}
