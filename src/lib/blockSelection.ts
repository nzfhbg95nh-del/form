// Sélection de blocs « façon Notion » : Échap sélectionne le bloc du curseur, Maj+↑/↓ étend, Suppr efface, Entrée revient au texte.
// Ici, la logique pure : l'ordre des blocs et les plages (la page, elle, ne fait que la mettre en images et l'appliquer).

export interface BlockLike {
  id: string
  children?: BlockLike[]
}

/** Les identifiants de tous les blocs (y compris imbriqués), dans l'ordre de lecture de la page. */
export function flatten(blocks: readonly BlockLike[]): string[] {
  const out: string[] = []
  const walk = (list: readonly BlockLike[]) => {
    for (const b of list) {
      out.push(b.id)
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks)
  return out
}

/** Les blocs entre `a` et `b` inclus, dans l'ordre de la page (peu importe lequel est le plus haut). */
export function rangeIds(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (i < 0 || j < 0) return []
  return order.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/** Le bloc voisin (au-dessus : -1, en dessous : 1), sans sortir de la page. */
export function neighbour(order: readonly string[], id: string, dir: -1 | 1): string {
  const i = order.indexOf(id)
  if (i < 0) return id
  return order[Math.min(order.length - 1, Math.max(0, i + dir))]
}

/** Après la suppression de blocs : où poser le curseur (le bloc juste avant le premier supprimé, sinon celui d'après). */
export function afterRemoval(order: readonly string[], removed: readonly string[]): string | null {
  const gone = new Set(removed)
  const first = order.findIndex((id) => gone.has(id))
  if (first < 0) return null
  for (let i = first - 1; i >= 0; i--) if (!gone.has(order[i])) return order[i]
  for (let i = first + 1; i < order.length; i++) if (!gone.has(order[i])) return order[i]
  return null
}

/** Un bloc sans ses identifiants (lui et ses enfants) : prêt à être inséré comme copie. */
export function withoutIds<T extends { id?: string; children?: unknown[] }>(block: T): Omit<T, 'id'> {
  const { id: _id, children, ...rest } = block
  void _id
  return children?.length ? ({ ...rest, children: children.map((c) => withoutIds(c as { id?: string; children?: unknown[] })) } as unknown as Omit<T, 'id'>) : (rest as Omit<T, 'id'>)
}
