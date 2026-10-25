import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSetting } from '@/biblio/lib/library.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'

/**
 * Mise à jour automatique de la bibliothèque, quelques secondes après le lancement de Form : nouveaux fichiers de Social Saver,
 * miniatures, empreintes d'IA, couleurs, texte des vidéos, classement. Rien ne se lance s'il n'y a rien de nouveau.
 * Seulement dans la fenêtre principale, et seulement si le réglage n'est pas coupé.
 */
export async function startLibraryBackground() {
  if (getCurrentWindow().label !== 'main') return
  const auto = (await getSetting('library_auto_update')) !== '0'
  if (!auto) return
  await useLibrary.getState().init(true)
  await useAi.getState().init(true)
}
