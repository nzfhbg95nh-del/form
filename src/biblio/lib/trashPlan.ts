// Corbeille de la bibliothèque : petites décisions « pures » (rien ne touche à la base ni à l'écran), testées automatiquement.

interface Sortable {
  key: string
  trashedAt: string
}

/** Du plus récemment supprimé au plus ancien ; à égalité, toujours le même ordre. */
export function sortTrash<T extends Sortable>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.trashedAt === b.trashedAt ? a.key.localeCompare(b.key) : a.trashedAt < b.trashedAt ? 1 : -1))
}

/**
 * Supprimer des images d'un carrousel : s'il n'en resterait plus aucune, c'est tout le carrousel qui part à la corbeille
 * (un carrousel vide n'aurait plus rien à montrer) ; sinon, seulement ces images.
 */
export function carouselTrashPlan(allRels: readonly string[], chosen: readonly string[]): { whole: true } | { whole: false; rels: string[] } {
  const picked = new Set(chosen.filter((r) => allRels.includes(r)))
  if (picked.size === 0) return { whole: false, rels: [] }
  if (allRels.every((r) => picked.has(r))) return { whole: true }
  return { whole: false, rels: allRels.filter((r) => picked.has(r)) }
}

/** Sépare une sélection de la corbeille en images entières (ids de blocs) et images seules de carrousels (chemins). */
export function splitTrashSelection(items: readonly { key: string; type: 'block' | 'file' }[], keys: ReadonlySet<string>): { blockIds: string[]; rels: string[] } {
  const blockIds: string[] = []
  const rels: string[] = []
  for (const item of items) {
    if (!keys.has(item.key)) continue
    if (item.type === 'block') blockIds.push(item.key)
    else rels.push(item.key)
  }
  return { blockIds, rels }
}
