import { getCurrentWindow } from '@tauri-apps/api/window'
import { dayKey, parseFrequency, shouldAutoUpdate } from '@/biblio/lib/autoUpdate.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { getSearchIndex } from '@/biblio/lib/searchIndex.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'

/**
 * Mise à jour automatique de la bibliothèque, quelques secondes après le lancement de Form : nouveaux fichiers de Form,
 * miniatures, empreintes d'IA, couleurs, texte des vidéos, classement. Rien ne se lance s'il n'y a rien de nouveau.
 * Seulement dans la fenêtre principale, et selon la fréquence choisie dans Réglages > Bibliothèque (jamais, au démarrage, par jour, semaine ou mois).
 */
export async function startLibraryBackground() {
  if (getCurrentWindow().label !== 'main') return
  // Les empreintes sont lues en arrière-plan dès le lancement : la Carte et la recherche par contenu les trouvent déjà prêtes.
  window.setTimeout(() => void getSearchIndex().catch(() => undefined), 3000)
  const frequency = parseFrequency(await getSetting('library_auto_frequency'), await getSetting('library_auto_update'))
  const now = new Date()
  if (!shouldAutoUpdate(frequency, await getSetting('library_auto_last_day'), now)) return
  await useLibrary.getState().init(true)
  await useAi.getState().init(true)
  // Le jour n'est noté qu'une fois la mise à jour allée au bout : fermée en route, elle sera relancée au prochain démarrage.
  await setSetting('library_auto_last_day', dayKey(now))
}
