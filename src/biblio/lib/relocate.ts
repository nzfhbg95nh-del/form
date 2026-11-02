import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { setAjoutsDir } from '@/biblio/lib/media.ts'
import type { LayoutInfo, MovePreview, MoveProgress, MoveResult } from './relocatePure.ts'

/** Branche l'appli sur un dossier de bibliothèque : « images ajoutées » et le cache (miniatures, modèle d'IA) le suivent. */
export async function applyLibraryRoot(root: string): Promise<LayoutInfo | null> {
  try {
    const info = await invoke<LayoutInfo>('library_set_root', { root })
    setAjoutsDir(info.added_dir)
    return info
  } catch {
    return null
  }
}

/** Ce qui serait copié et la place libre à destination, sans rien copier. */
export const previewMove = (from: string, to: string) => invoke<MovePreview>('library_move_preview', { from, to })

/** Copie la bibliothèque vers `to` (l'ancien dossier n'est jamais touché) en rapportant l'avancement. */
export async function runMove(from: string, to: string, onProgress: (p: MoveProgress) => void): Promise<MoveResult> {
  const stop = await listen<MoveProgress>('library-move-progress', (e) => onProgress(e.payload))
  try {
    return await invoke<MoveResult>('library_move', { from, to })
  } finally {
    stop()
  }
}

export const cancelMove = () => invoke('library_move_cancel')
