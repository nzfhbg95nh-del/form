import type { ObjectRow } from './types'

export type DropZone = 'before' | 'after' | 'into'

const bySort = (a: ObjectRow, b: ObjectRow) => a.position - b.position || a.created_at.localeCompare(b.created_at)

/** Enfants directs (non supprimés) d'une page, dans l'ordre d'affichage. */
export function childrenOf(objects: ObjectRow[], parentId: string | null): ObjectRow[] {
  return objects
    .filter((o) => (o.type === 'page' || o.type === 'database' || o.type === 'moodboard') && !o.deleted_at && (o.parent_id ?? null) === parentId)
    .sort(bySort)
}

/** Tous les descendants d'une page (supprimés ou non), du plus proche au plus profond. */
export function descendantsOf(objects: ObjectRow[], id: string): ObjectRow[] {
  const result: ObjectRow[] = []
  let level = [id]
  while (level.length > 0) {
    const next = objects.filter((o) => o.parent_id !== null && level.includes(o.parent_id))
    result.push(...next)
    level = next.map((o) => o.id)
  }
  return result
}

export function isDescendant(objects: ObjectRow[], ancestorId: string, id: string): boolean {
  return descendantsOf(objects, ancestorId).some((o) => o.id === id)
}

/** Où atterrit une page lâchée sur une autre ? Renvoie null si le déplacement est interdit. */
export function computeMove(
  objects: ObjectRow[],
  dragId: string,
  targetId: string,
  zone: DropZone,
): { parent_id: string | null; position: number } | null {
  if (dragId === targetId || isDescendant(objects, dragId, targetId)) return null
  const target = objects.find((o) => o.id === targetId)
  if (!target) return null

  if (zone === 'into') {
    const kids = childrenOf(objects, targetId).filter((o) => o.id !== dragId)
    const last = kids[kids.length - 1]
    return { parent_id: targetId, position: last ? last.position + 1000 : 1000 }
  }

  const parent = target.parent_id ?? null
  const siblings = childrenOf(objects, parent).filter((o) => o.id !== dragId)
  const i = siblings.findIndex((o) => o.id === targetId)
  if (zone === 'before') {
    const prev = siblings[i - 1]
    return { parent_id: parent, position: prev ? (prev.position + target.position) / 2 : target.position - 1000 }
  }
  const next = siblings[i + 1]
  return { parent_id: parent, position: next ? (next.position + target.position) / 2 : target.position + 1000 }
}

/** Page à dupliquer + toutes ses sous-pages / lignes non supprimées, parents avant enfants. */
export function duplicationOrder(objects: ObjectRow[], id: string): ObjectRow[] {
  const root = objects.find((o) => o.id === id)
  if (!root) return []
  return [root, ...descendantsOf(objects, id).filter((o) => !o.deleted_at)]
}
