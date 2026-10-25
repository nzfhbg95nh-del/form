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

async function build(): Promise<SearchIndex> {
  const d = await getDb()
  const rows = await d.select<{ block: string; rel: string; vec: string }[]>(
    'SELECT f.block_id AS block, f.path_rel AS rel, e.vec FROM lib_embeddings e JOIN lib_files f ON f.path_rel = e.path_rel WHERE e.model = $1 AND f.missing = 0',
    [MODEL_ID],
  )
  const ids: string[] = []
  const number = new Map<string, number>()
  const blockOf = new Int32Array(rows.length)
  const vectors: Float32Array[] = []
  const rels: string[] = []
  rows.forEach((r, j) => {
    rels.push(r.rel)
    let b = number.get(r.block)
    if (b === undefined) {
      b = ids.length
      ids.push(r.block)
      number.set(r.block, b)
    }
    blockOf[j] = b
    vectors.push(decodeVector(r.vec))
  })
  const dim = vectors[0]?.length ?? 0
  const matrix = new Float32Array(vectors.length * dim)
  vectors.forEach((v, j) => matrix.set(v, j * dim))
  return { dim, ids, matrix, blockOf, rels }
}
export const getSearchIndex = (): Promise<SearchIndex> => (cached ??= build())

/** À appeler quand de nouvelles empreintes ont été calculées : l'index sera relu à la prochaine recherche. */
export function resetSearchIndex() {
  cached = null
}
