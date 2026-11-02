// Connexion à Instagram / Pinterest depuis une fenêtre de Form (voir `login.rs`) : Victor tape son mot de passe lui-même sur le site,
// Form garde la session et prépare le fichier cookies.txt du téléchargement.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { parseDownloadFrequency } from './autoUpdate.ts'
import { getSetting, setSetting } from './library.ts'
import { buildJobs, loadSaverSettings, saveSaverSettings } from './saver.ts'

export type Site = 'instagram' | 'pinterest'

export interface LoginStatus {
  connected: boolean
  cookiesFile: string | null
  /** Fin de la session (secondes Unix), si le site la donne. */
  expires: number | null
}

export const SITE_NAMES: Record<Site, string> = { instagram: 'Instagram', pinterest: 'Pinterest' }

export const loginOpen = (site: Site) => invoke<void>('login_open', { siteKey: site })
export const loginClose = (site: Site) => invoke<void>('login_close', { siteKey: site })
export const loginCheck = (site: Site) => invoke<LoginStatus>('login_check', { siteKey: site })

/** Ce qu'on dit à Victor de l'état de la connexion. */
export function loginLabel(status: LoginStatus | null, now = new Date()): string {
  if (!status) return 'Vérification…'
  if (!status.connected) return 'Non connecté'
  if (status.expires === null) return 'Connecté'
  const days = Math.ceil((status.expires * 1000 - now.getTime()) / 86_400_000)
  if (days <= 0) return 'Connexion expirée'
  return days > 60 ? 'Connecté' : `Connecté (encore ${days} jour${days > 1 ? 's' : ''})`
}

/** Retient le fichier de cookies préparé par Form dans les réglages du téléchargement. */
export async function adoptCookies(site: Site, file: string) {
  const { settings } = await loadSaverSettings()
  const key = site === 'instagram' ? 'igCookies' : 'pinCookies'
  if (settings[key] !== file) await saveSaverSettings({ ...settings, [key]: file })
}

export const ALERT_KEY = 'saver_login_alert'
export const DOWNLOAD_FREQUENCY_KEY = 'library_download_frequency'
export const DOWNLOAD_LAST_DAY_KEY = 'library_download_last_day'
/** Ancienne case à cocher (avant le choix d'un rythme). */
const LEGACY_DOWNLOAD_KEY = 'library_auto_download'

/** Le rythme du téléchargement automatique des nouveaux enregistrements (jamais par défaut). */
export const downloadFrequency = async () => parseDownloadFrequency(await getSetting(DOWNLOAD_FREQUENCY_KEY), await getSetting(LEGACY_DOWNLOAD_KEY))

/** Garde (ou efface) le message « connexion à refaire » que les Réglages affichent. */
export const setAlert = (message: string | null) => setSetting(ALERT_KEY, message ?? '')

/**
 * Téléchargement automatique des nouveaux enregistrements Instagram / Pinterest. Renvoie un message pour Victor
 * (connexion à refaire…) ou null si tout va bien. Ne bloque jamais : un site sans connexion valable est simplement sauté.
 */
export async function autoDownload(root: string): Promise<string | null> {
  const { settings } = await loadSaverSettings()
  const skipped: string[] = []
  const sites: [Site, boolean][] = [['instagram', settings.doIg], ['pinterest', settings.doPin]]
  for (const [site, wanted] of sites) {
    if (!wanted) continue
    const status = await loginCheck(site).catch(() => null)
    if (status?.connected && status.cookiesFile) {
      await adoptCookies(site, status.cookiesFile)
      settings[site === 'instagram' ? 'igCookies' : 'pinCookies'] = status.cookiesFile
    } else {
      skipped.push(SITE_NAMES[site])
      if (site === 'instagram') settings.doIg = false
      else settings.doPin = false
    }
  }
  const message = skipped.length > 0 ? `Connexion à ${skipped.join(' et ')} à refaire (Réglages > Bibliothèque > Téléchargement) : rien n'a été téléchargé de ce site.` : null
  const { jobs } = buildJobs(settings)
  if (jobs.length === 0) return message
  const finished = new Promise<void>((resolve) => {
    let off: (() => void) | null = null
    const done = () => { window.clearTimeout(timer); off?.(); resolve() }
    const timer = window.setTimeout(done, 3 * 3600_000)
    void listen('saver-done', done).then((u) => { off = u })
  })
  const started = await invoke<boolean>('saver_start', { outDir: root, jobs })
  if (started) await finished
  return message
}
