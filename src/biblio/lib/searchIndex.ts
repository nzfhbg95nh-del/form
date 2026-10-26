// Empreintes des images pour la recherche par contenu, chargées une fois puis gardées en mémoire.

import { MODEL_ID } from './ai.ts'
import { getDb } from './db.ts'
import { decodeVector } from './vectors.ts'

export interface SearchIndex {
  dim: number
  /** Les identifiants des blocs. */
  ids: string[]
  /** Une empreinte par image (de longueur 1), l'une après l'autre. */
  matrix: Float32Array
  /** Pour chaque image : le numéro de son bloc dans `ids`. */
  blockOf: Int32Array
  /** Pour chaque image : son chemin relatif (pour retrouver l'empreinte d'une image précise). */
  rels: string[]
}

let cached: Promise<SearchIndex> | null = null

/** Les empreintes sont lues par paquets (et l'écran garde la main entre deux paquets) : 46 Mo d'un coup bloquaient la fenêtre. */
const PAGE = 2000

async function build(): Promise<SearchIndex> {
  const d = await getDb()
  const ids: string[] = []
  const number = new Map<string, number>()
  const blocks: number[] = []
  const rels: string[] = []
  const pages: Float32Array[] = []
  let dim = 0
  let after = ''
  for (;;) {
    const rows = await d.select<{ block: string; rel: string; vec: string }[]>(
      `SELECT f.block_id AS block, f.path_rel AS rel, e.vec FROM lib_embeddings e JOIN lib_files f ON f.path_rel = e.path_rel
       WHERE e.model = $1 AND f.missing = 0 AND e.path_rel > $2 ORDER BY e.path_rel LIMIT ${PAGE}`,
      [MODEL_ID, after],
    )
    if (rows.length === 0) break
    let page: Float32Array | null = null
    rows.forEach((r, j) => {
      rels.push(r.rel)
      let b = number.get(r.block)
      if (b === undefined) {
        b = ids.length
        ids.push(r.block)
        number.set(r.block, b)
      }
      blocks.push(b)
      const v = decodeVector(r.vec)
      if (dim === 0) dim = v.length
      page ??= new Float32Array(rows.length * dim)
      page.set(v, j * dim)
    })
    if (page) pages.push(page)
    after = rows[rows.length - 1].rel
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const matrix = new Float32Array(rels.length * dim)
  let at = 0
  for (const page of pages) {
    matrix.set(page, at)
    at += page.length
  }
  return { dim, ids, matrix, blockOf: Int32Array.from(blocks), rels }
}
export const getSearchIndex = (): Promise<SearchIndex> =>
  (cached ??= build().catch((e) => {
    cached = null // une lecture ratée ne doit pas rester en mémoire : la suivante réessaie
    throw e
  }))

/** À appeler quand de nouvelles empreintes ont été calculées : l'index sera relu à la prochaine recherche. */
export function resetSearchIndex() {
  cached = null
}
