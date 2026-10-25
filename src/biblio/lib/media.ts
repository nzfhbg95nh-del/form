// Où trouver les fichiers : les originaux restent dans le dossier de Social Saver, les miniatures dans les données de Klippr.

import { convertFileSrc } from '@tauri-apps/api/core'

const toWindows = (p: string) => p.replace(/\//g, '\\')

/** Chemin complet (Windows) d'un original, depuis le dossier choisi et le chemin relatif. */
export const originalPath = (root: string, rel: string) => `${root.replace(/[\\/]+$/, '')}\\${toWindows(rel)}`

/** Adresse utilisable dans <img> / <video> pour un fichier du disque. */
export const fileUrl = (fullPath: string) => convertFileSrc(fullPath)

export const thumbPath = (thumbsDir: string, thumb: string) => `${thumbsDir.replace(/[\\/]+$/, '')}\\${toWindows(thumb)}`

const MONTHS_FR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** « 2026-09-21 » → « 21 septembre 2026 ». */
export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : MONTHS_FR.format(d)
}
