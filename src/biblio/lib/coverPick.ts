// Choisir une image de ma bibliothèque comme image d'une recette (ou comme couverture de n'importe quelle page de Form).
// L'image est COPIÉE (réduite, en JPEG) : le fichier de la bibliothèque n'est ni déplacé ni modifié.

import { coverFromBlob } from '@/lib/images'
import { filterBlocks, EMPTY_FILTERS } from './filters.ts'
import type { GridBlock } from './blocks.ts'
import { fileUrl, originalPath, thumbPath } from './media.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import type { TypeIndex } from './types.ts'

/** Au plus ce nombre de miniatures dans la fenêtre de choix. */
export const PICK_LIMIT = 150

/** Les blocs qu'on peut proposer (ils ont une image à montrer), filtrés par ce que Victor tape (auteur, tableau, texte lu dans l'image…). */
export function pickableBlocks(blocks: readonly GridBlock[], query: string, typeIndex: TypeIndex, limit = PICK_LIMIT): GridBlock[] {
  const usable = blocks.filter((b) => !b.missing && b.thumb)
  const found = query.trim() ? filterBlocks(usable, { ...EMPTY_FILTERS, query }, typeIndex) : usable
  return found.slice(0, limit)
}

async function toBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url)
    return r.ok ? await r.blob() : null
  } catch {
    return null
  }
}

/** L'image du bloc en couverture (JPEG réduit, en base64) : l'original s'il se lit (sauf vidéo), sinon la miniature (HEIC, fichier absent…). */
export async function libraryCover(block: GridBlock): Promise<string | null> {
  const root = useLibrary.getState().root
  const thumbsDir = useGrid.getState().thumbsDir
  if (block.firstKind === 'image' && root) {
    const original = await toBlob(fileUrl(originalPath(root, block.rel)))
    if (original) {
      try {
        return await coverFromBlob(original)
      } catch {
        /* format que l'écran ne sait pas lire : on essaie la miniature */
      }
    }
  }
  if (block.thumb && thumbsDir) {
    const thumb = await toBlob(fileUrl(thumbPath(thumbsDir, block.thumb)))
    if (thumb) return coverFromBlob(thumb).catch(() => null)
  }
  return null
}
