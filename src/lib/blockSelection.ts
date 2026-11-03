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

/** Le nombre de colonnes d'une grille d'images : 2 pour deux images, 3 ensuite (comme une planche Pinterest). */
export const gridColumns = (count: number) => (count <= 2 ? 2 : 3)

/**
 * Des images rangées en grille façon Pinterest : une seule liste de colonnes côte à côte, chaque colonne empile ses images à leur proportion naturelle.
 * Chaque image va dans la colonne la moins haute à ce moment-là (`ratios` = hauteur ÷ largeur de chaque image ; 1 si inconnue), pour des colonnes
 * de même hauteur. Moins de deux images : rien à ranger.
 */
export function imageGrid(images: readonly object[], ratios: readonly number[] = []): object[] {
  if (images.length < 2) return []
  const n = gridColumns(images.length)
  const cols: object[][] = Array.from({ length: n }, () => [])
  const heights = new Array<number>(n).fill(0)
  images.forEach((img, i) => {
    const r = ratios[i] && Number.isFinite(ratios[i]) && ratios[i] > 0 ? ratios[i] : 1
    let k = 0
    for (let j = 1; j < n; j++) if (heights[j] < heights[k] - 1e-9) k = j
    cols[k].push(img)
    heights[k] += r
  })
  return [{ type: 'columnList', children: cols.map((children) => ({ type: 'column', props: { width: 1 }, children })) }]
}
interface TypedBlock {
  type: string
  children?: TypedBlock[]
}

/** Les images d'un bloc qui n'est qu'une image ou qu'une grille d'images (liste de colonnes ne contenant que des images) ; sinon null. */
export function imagesOfGridBlock(block: TypedBlock | undefined): TypedBlock[] | null {
  if (!block) return null
  if (block.type === 'image') return [block]
  if (block.type !== 'columnList') return null
  const found: TypedBlock[] = []
  for (const col of block.children ?? []) {
    for (const child of col.children ?? []) {
      if (child.type !== 'image') return null
      found.push(child)
    }
  }
  return found.length > 0 ? found : null
}

/** Un bloc sans ses identifiants (lui et ses enfants) : prêt à être inséré comme copie. */
export function withoutIds<T extends { id?: string; children?: unknown[] }>(block: T): Omit<T, 'id'> {
  const { id: _id, children, ...rest } = block
  void _id
  return children?.length ? ({ ...rest, children: children.map((c) => withoutIds(c as { id?: string; children?: unknown[] })) } as unknown as Omit<T, 'id'>) : (rest as Omit<T, 'id'>)
}
