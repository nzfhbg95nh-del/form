// Où trouver les fichiers : les originaux restent dans le dossier de Social Saver, les miniatures dans les données de Klippr.

import { convertFileSrc } from '@tauri-apps/api/core'

const toWindows = (p: string) => p.replace(/\//g, '\\')

/** Début du chemin relatif des images ajoutées à la main (dossier « Mes ajouts », hors du dossier de Social Saver). */
export const AJOUTS_PREFIX = 'ajouts/'
let ajoutsDir = ''
/** Le dossier Mes ajouts, connu au démarrage de la bibliothèque. */
export const setAjoutsDir = (dir: string) => { ajoutsDir = dir }

/** Chemin complet (Windows) d'un original, depuis le dossier choisi et le chemin relatif. */
export const originalPath = (root: string, rel: string) =>
  rel.startsWith(AJOUTS_PREFIX) && ajoutsDir
    ? `${ajoutsDir.replace(/[\\/]+$/, '')}\\${toWindows(rel.slice(AJOUTS_PREFIX.length))}`
    : `${root.replace(/[\\/]+$/, '')}\\${toWindows(rel)}`

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
