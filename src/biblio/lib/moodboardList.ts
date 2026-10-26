// La liste des moodboards de Form pour la page « Moodboards » de la bibliothèque (sans accès à la base : testée telle quelle).

import { parseBoard } from '@/lib/moodboard'
import type { ObjectRow } from '@/lib/types'

export interface BoardCard {
  id: string
  name: string
  /** Si le moodboard est posé dans une page (bloc « /moodboard »), le titre de cette page. */
  parentName: string | null
  images: number
  updatedAt: string
}

/** Tous les moodboards qui ne sont pas à la corbeille (créés dans la barre latérale, dans la bibliothèque ou dans une page), le plus récent d'abord. */
export function listBoards(objects: readonly ObjectRow[]): BoardCard[] {
  const byId = new Map(objects.map((o) => [o.id, o]))
  return objects
    .filter((o) => o.type === 'moodboard' && !o.deleted_at)
    .map((o) => {
      const parent = o.parent_id ? byId.get(o.parent_id) : undefined
      return {
        id: o.id,
        name: o.title.trim() || 'Moodboard',
        parentName: parent && !parent.deleted_at && parent.type !== 'moodboard' ? parent.title.trim() || 'Sans titre' : null,
        images: parseBoard(o.content).items.filter((i) => i.kind === 'image').length,
        updatedAt: o.updated_at,
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** « 12 images », « 1 image », « Vide ». */
export const imagesLabel = (n: number) => (n === 0 ? 'Vide' : `${n} image${n > 1 ? 's' : ''}`)
