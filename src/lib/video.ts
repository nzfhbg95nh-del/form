// Les vidéos dans les pages et les moodboards : un fichier de l'ordinateur (on garde son chemin, jamais une copie : la base reste légère)
// ou un lien YouTube / Vimeo / Loom. Logique pure, testée automatiquement.

import { embedFor, type EmbedInfo } from '@/lib/embeds'

/** Les formats que le lecteur de l'appli sait lire. */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'ogv']

/** Les sites de vidéos pris en charge par lien. */
const VIDEO_SITES = ['youtube', 'vimeo', 'loom']

const extensionOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name.trim())?.[1] ?? '').toLowerCase()

/** Le nom d'un fichier, à partir de son chemin complet (Windows ou autre). */
export const fileNameOf = (path: string) => path.trim().split(/[\\/]/).pop() ?? ''

export const isVideoFileName = (name: string) => VIDEO_EXTENSIONS.includes(extensionOf(name))

/** Un chemin d'ordinateur : `C:\Videos\a.mp4`, `C:/Videos/a.mp4` ou un partage réseau `\\serveur\a.mp4`. */
export const isLocalPath = (value: string) => /^[a-z]:[\\/]/i.test(value.trim()) || value.trim().startsWith('\\\\')

export type VideoSource =
  | { kind: 'file'; path: string; name: string }
  | { kind: 'embed'; info: EmbedInfo; url: string }

/** Ce qu'une valeur enregistrée représente : un fichier de l'ordinateur, un lien intégrable, ou rien. */
export function videoSource(value: string): VideoSource | null {
  const v = value.trim()
  if (!v) return null
  if (isLocalPath(v)) return isVideoFileName(v) ? { kind: 'file', path: v, name: fileNameOf(v) } : null
  const info = embedFor(v)
  return info && VIDEO_SITES.includes(info.provider) ? { kind: 'embed', info, url: v } : null
}

/** Le titre affiché pour une vidéo : son nom de fichier (sans extension) ou le nom du site. */
export function videoTitle(value: string): string {
  const src = videoSource(value)
  if (!src) return value.trim()
  if (src.kind === 'embed') return src.info.label
  return src.name.replace(/\.[^.]+$/, '')
}

/** Le message quand un lien ne peut pas devenir une vidéo. */
export const VIDEO_LINK_PROBLEM = 'Ce lien ne peut pas devenir une vidéo : colle un lien YouTube, Vimeo ou Loom.'

/** Les filtres du choix de fichier de Windows. */
export const VIDEO_FILE_FILTERS = [{ name: 'Vidéos', extensions: VIDEO_EXTENSIONS }]
