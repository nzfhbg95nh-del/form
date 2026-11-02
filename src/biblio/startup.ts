import { getCurrentWindow } from '@tauri-apps/api/window'
import { dayKey, parseFrequency, shouldAutoUpdate } from '@/biblio/lib/autoUpdate.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { getSearchIndex } from '@/biblio/lib/searchIndex.ts'
import { autoDownload, DOWNLOAD_LAST_DAY_KEY, downloadFrequency, setAlert } from '@/biblio/lib/siteLogin.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'

/**
 * Travail automatique de la bibliothèque, quelques secondes après le lancement de Form, dans la fenêtre principale seulement :
 * - le téléchargement des nouveaux enregistrements Instagram / Pinterest, à son rythme (Réglages > Bibliothèque > Téléchargement) ;
 * - la mise à jour : nouveaux fichiers, miniatures, empreintes d'IA, couleurs, texte des vidéos, classement. Rien ne se lance
 *   s'il n'y a rien de nouveau. Son rythme se règle dans Réglages > Bibliothèque > Ma bibliothèque.
 */
export async function startLibraryBackground() {
  if (getCurrentWindow().label !== 'main') return
  // Les empreintes sont lues en arrière-plan dès le lancement : la Carte et la recherche par contenu les trouvent déjà prêtes.
  window.setTimeout(() => void getSearchIndex().catch(() => undefined), 3000)
  // La bibliothèque est branchée dès le démarrage (dossier connu) : les photos des recettes et les miniatures en ont besoin, même sans mise à jour.
  await useLibrary.getState().init(false)
  const now = new Date()
  const frequency = parseFrequency(await getSetting('library_auto_frequency'), await getSetting('library_auto_update'))
  const updateDue = shouldAutoUpdate(frequency, await getSetting('library_auto_last_day'), now)
  const downloadDue = shouldAutoUpdate(await downloadFrequency(), await getSetting(DOWNLOAD_LAST_DAY_KEY), now)
  if (!updateDue && !downloadDue) return

  let downloaded = false
  if (downloadDue) {
    const root = useLibrary.getState().root
    if (root) {
      try {
        const problem = await autoDownload(root)
        await setAlert(problem)
        downloaded = true
        // Le jour n'est noté que si tout s'est bien passé : une connexion à refaire est redemandée au prochain démarrage.
        if (!problem) await setSetting(DOWNLOAD_LAST_DAY_KEY, dayKey(now))
      } catch (e) {
        await setAlert(`Le téléchargement automatique a échoué : ${String(e)}`)
      }
    }
  }
  // Mise à jour due, ou nouveaux fichiers téléchargés : la bibliothèque lit son dossier, fait les miniatures, etc.
  if (updateDue || downloaded) await useLibrary.getState().update()
  await useAi.getState().init(true)
  // Le jour n'est noté qu'une fois la mise à jour allée au bout : fermée en route, elle sera relancée au prochain démarrage.
  if (updateDue) await setSetting('library_auto_last_day', dayKey(now))
}
