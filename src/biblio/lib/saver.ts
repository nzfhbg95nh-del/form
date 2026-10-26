// Télécharger mes enregistrements Instagram et Pinterest depuis Form (le travail de Social Saver). Le téléchargement lui-même est fait par le programme
// (gallery-dl, voir `saver.rs`) ; ici : les réglages retenus, les adresses à télécharger et les avertissements.

import { invoke } from '@tauri-apps/api/core'
import { getSetting, setSetting } from './library.ts'

export interface SaverSettings {
  igUser: string
  pinUrl: string
  igCookies: string
  pinCookies: string
  doIg: boolean
  doPin: boolean
}

export const EMPTY_SAVER: SaverSettings = { igUser: '', pinUrl: '', igCookies: '', pinCookies: '', doIg: true, doPin: true }

/** Les enregistrés d'un compte Instagram (celui de Victor : ses cookies donnent accès à ses enregistrés). */
export const instagramUrl = (user: string) => `https://www.instagram.com/${user.trim().replace(/^@+/, '')}/saved/`

export interface SaverJob {
  url: string
  cookies: string
}

/** Les adresses à télécharger, ou ce qui manque (dit en français simple). Instagram d'abord, comme Social Saver. */
export function buildJobs(s: SaverSettings): { jobs: SaverJob[]; problem: string | null } {
  const jobs: SaverJob[] = []
  if (s.doIg) {
    if (!s.igUser.trim().replace(/^@+/, '')) return { jobs: [], problem: 'Indique ton pseudo Instagram.' }
    if (!s.igCookies.trim()) return { jobs: [], problem: "Choisis ton fichier cookies.txt d'Instagram." }
    jobs.push({ url: instagramUrl(s.igUser), cookies: s.igCookies.trim() })
  }
  if (s.doPin) {
    if (!s.pinUrl.trim()) return { jobs: [], problem: 'Indique le lien de ton profil Pinterest.' }
    if (!s.pinCookies.trim()) return { jobs: [], problem: 'Choisis ton fichier cookies.txt de Pinterest.' }
    jobs.push({ url: s.pinUrl.trim(), cookies: s.pinCookies.trim() })
  }
  return jobs.length > 0 ? { jobs, problem: null } : { jobs: [], problem: 'Coche au moins une source.' }
}

/** Les cookies expirent vite : passé ce nombre de jours, Form conseille de refaire l'export. */
export const COOKIE_OLD_DAYS = 3

export function cookieNote(path: string, ageDays: number | null): string | null {
  if (!path.trim()) return null
  if (ageDays === null) return 'Fichier introuvable : choisis-le à nouveau.'
  if (ageDays > COOKIE_OLD_DAYS) return `Fichier de cookies vieux de ${ageDays} jours : s'il échoue, refais l'export depuis Chrome.`
  return null
}

const KEYS = { igUser: 'saver_ig_user', pinUrl: 'saver_pin_url', igCookies: 'saver_ig_cookies', pinCookies: 'saver_pin_cookies', doIg: 'saver_do_ig', doPin: 'saver_do_pin' } as const

interface Defaults {
  ig_user: string | null
  pin_url: string | null
  do_ig: boolean | null
  do_pin: boolean | null
  ig_cookies: string | null
  pin_cookies: string | null
}

export async function saveSaverSettings(s: SaverSettings) {
  await Promise.all([
    setSetting(KEYS.igUser, s.igUser), setSetting(KEYS.pinUrl, s.pinUrl), setSetting(KEYS.igCookies, s.igCookies), setSetting(KEYS.pinCookies, s.pinCookies),
    setSetting(KEYS.doIg, s.doIg ? '1' : '0'), setSetting(KEYS.doPin, s.doPin ? '1' : '0'),
  ])
}

/** Les réglages retenus par Form ; la première fois, ils sont préremplis depuis ceux de Social Saver (lus sans rien y changer). */
export async function loadSaverSettings(): Promise<{ settings: SaverSettings; prefilled: boolean }> {
  const stored = await getSetting(KEYS.igUser)
  const [pinUrl, igCookies, pinCookies, doIg, doPin] = await Promise.all([
    getSetting(KEYS.pinUrl), getSetting(KEYS.igCookies), getSetting(KEYS.pinCookies), getSetting(KEYS.doIg), getSetting(KEYS.doPin),
  ])
  if (stored !== null || pinUrl !== null) {
    return { settings: { igUser: stored ?? '', pinUrl: pinUrl ?? '', igCookies: igCookies ?? '', pinCookies: pinCookies ?? '', doIg: doIg !== '0', doPin: doPin !== '0' }, prefilled: false }
  }
  const d = await invoke<Defaults>('saver_defaults').catch(() => null)
  if (!d) return { settings: EMPTY_SAVER, prefilled: false }
  const settings: SaverSettings = {
    igUser: d.ig_user ?? '', pinUrl: d.pin_url ?? '', igCookies: d.ig_cookies ?? '', pinCookies: d.pin_cookies ?? '', doIg: d.do_ig ?? true, doPin: d.do_pin ?? true,
  }
  await saveSaverSettings(settings)
  return { settings, prefilled: !!(d.ig_user || d.pin_url || d.ig_cookies || d.pin_cookies) }
}

export const cookieAge = (path: string) => (path.trim() ? invoke<number | null>('saver_file_age_days', { path: path.trim() }) : Promise.resolve(null))
