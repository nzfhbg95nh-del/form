// Choisir une vidéo sur l'ordinateur et la lire : on garde le chemin du fichier, la vidéo n'est jamais copiée dans la base.

import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/repo'
import { isLocalPath, VIDEO_FILE_FILTERS } from '@/lib/video'

/** Ouvre le choix de fichier de Windows ; rend le chemin choisi, ou rien. */
export async function pickVideoFile(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ multiple: false, filters: VIDEO_FILE_FILTERS, title: 'Choisir une vidéo' })
  return typeof path === 'string' ? path : null
}

/** L'adresse que le lecteur peut lire pour un chemin d'ordinateur (les autres valeurs sont gardées telles quelles). */
export const playableUrl = (value: string) => (isLocalPath(value) ? convertFileSrc(value.trim()) : value)
