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
  /** L'image choisie pour passer en avant sur la carte (identifiant d'une image du moodboard), ou rien. */
  coverAsset: string | null
}

/** L'image de couverture retenue dans les propriétés d'un moodboard. */
export function coverAssetOf(properties: string | null): string | null {
  try {
    const v = JSON.parse(properties || '{}')?.coverAsset
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

/** Les propriétés avec la nouvelle image de couverture (`null` : on revient aux images les plus récentes). Le reste des propriétés est gardé. */
export function withCoverAsset(properties: string | null, assetId: string | null): string {
  let base: Record<string, unknown> = {}
  try {
    const v = JSON.parse(properties || '{}')
    if (v && typeof v === 'object' && !Array.isArray(v)) base = v
  } catch { /* propriétés illisibles : on repart de zéro */ }
  const { coverAsset: _old, ...rest } = base
  void _old
  return JSON.stringify(assetId ? { ...rest, coverAsset: assetId } : rest)
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
        coverAsset: coverAssetOf(o.properties),
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** « 12 images », « 1 image », « Vide ». */
export const imagesLabel = (n: number) => (n === 0 ? 'Vide' : `${n} image${n > 1 ? 's' : ''}`)
