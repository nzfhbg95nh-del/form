import { isLibraryUrl, libraryRel } from '@/lib/libraryImages'
import { fileUrl, originalPath } from '@/biblio/lib/media.ts'
import { useLibrary } from '@/biblio/store/library.ts'

/**
 * L'adresse à afficher pour l'image d'une page. Une photo rangée dans la bibliothèque (« form-lib:recette/… ») se retrouve à partir
 * du dossier choisi ; toute autre adresse (photo intégrée, lien) est renvoyée telle quelle. Avant que le dossier soit connu, une
 * photo de la bibliothèque n'a pas encore d'adresse (rien) : les écrans qui s'abonnent à `useLibrary` se mettent à jour ensuite.
 */
export function displayUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (!isLibraryUrl(url)) return url
  const rel = libraryRel(url)
  const { ready, root } = useLibrary.getState()
  return rel && ready ? fileUrl(originalPath(root, rel)) : null
}

/** Pour l'éditeur de pages : attend que la bibliothèque soit prête, puis donne l'adresse affichable. */
export async function resolveForEditor(url: string): Promise<string> {
  if (!isLibraryUrl(url)) return url
  if (!useLibrary.getState().ready) await useLibrary.getState().init(false)
  return displayUrl(url) ?? url
}
