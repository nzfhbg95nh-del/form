// Les calculs de l'ajout aux moodboards de Form (sans accès à la base : testés tels quels).

import type { BlockFileInfo } from '@/biblio/lib/blocks.ts'
import { arrangeFlow, boundsOf, type BoardItem } from '@/lib/moodboard'

/** Un carrousel apporte toutes ses images, dix au plus. */
export const MAX_SLIDES = 10
/** Écart entre ce qui est déjà sur la toile et les images ajoutées. */
const GAP = 80

const PREFIX = 'biblio:'

/** Nom enregistré avec la copie : il permet de retrouver, plus tard, les moodboards qui contiennent une image de la bibliothèque. */
export const assetName = (blockId: string, filename: string) => `${PREFIX}${blockId}|${filename}`
/** Début du nom de toutes les copies d'un bloc. */
export const assetPrefix = (blockId: string) => `${PREFIX}${blockId}|`

/** Les fichiers d'un bloc à mettre sur la toile (une vidéo par son image d'aperçu) ; ceux qui ont disparu du disque sans miniature sont écartés ; au plus `limit`. */
export function slidesOf(files: readonly BlockFileInfo[], limit = MAX_SLIDES): BlockFileInfo[] {
  return files.filter((f) => !f.missing || f.thumb).slice(0, limit)
}

/** Range les nouvelles images en lignes, à droite de ce qui est déjà sur la toile (ou au centre d'une toile vide). */
export function placeNewItems(existing: readonly BoardItem[], created: readonly BoardItem[]): BoardItem[] {
  if (created.length === 0) return [...existing]
  const ids = new Set(created.map((c) => c.id))
  const flowed = arrangeFlow([...created], ids)
  const box = boundsOf(flowed)
  const old = boundsOf([...existing])
  if (!box) return [...existing, ...flowed]
  const dx = (old ? old.x + old.w + GAP : -box.w / 2) - box.x
  const dy = (old ? old.y : -box.h / 2) - box.y
  return [...existing, ...flowed.map((i) => ({ ...i, x: i.x + dx, y: i.y + dy }))]
}

/** Le message qui confirme l'ajout. */
export function addedMessage(added: number, failed: number, boardName: string): string {
  if (added === 0) return failed > 0 ? 'Impossible de lire ces images.' : 'Rien à ajouter.'
  const base = `${added} image${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} à « ${boardName} »`
  return failed > 0 ? `${base} (${failed} illisible${failed > 1 ? 's' : ''}).` : `${base}.`
}
