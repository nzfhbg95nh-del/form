// Classement automatique : lit les empreintes en base, fait chercher les types (voisines, régression et descriptions) par un worker,
// range le reste dans « Autres », et enregistre le résultat. Voir classify.ts pour la règle.

import { getDb, multiInsert } from './db.ts'
import { MODEL_ID } from './ai.ts'
import { getTextStatus, textVectors } from './aiText.ts'
import { applyExclusive, blockVector, withFallback, type Row } from './classify.ts'
import type { WorkerInput, WorkerOutput } from './classify.worker.ts'
import { buildExampleSet, DEFAULT_OPTIONS } from './neighbours.ts'
import { allPrompts, buildPromptMatrix, SEMANTIC_TYPES, thresholdsOf } from './semantic.ts'
import { decodeVector } from './vectors.ts'

/** À changer quand la règle de classement change : Klippr refait alors le classement une fois au démarrage. */
export const CLASSIFY_VERSION = '8'
export const OTHER_TYPE_ID = 'autres'
/** Types exclusifs, par ordre de priorité : une image qui en reçoit un n'a plus que celui-là. */
export const EXCLUSIVE_TYPES = ['recette', OTHER_TYPE_ID]

export interface ClassifyRun {
  /** Images hors tableau rangées dans un type par leurs voisines. */
  byNeighbours: number
  /** Images qui ont reçu un type décrit en mots, par type (par exemple { typo: 1439 }). */
  semantic: Record<string, number>
  /** Images rangées dans « Autres » : l'IA n'est pas assez sûre, ou il n'y a rien d'autre pour elles. */
  fallback: number
  examples: number
  seconds: number
}

/**
 * Refait le classement automatique. Ce que Victor a rangé (tableaux, choix à la main) ou retiré n'est jamais touché ;
 * l'ancien classement automatique est remplacé. Le résultat est marqué « auto ».
 * `threshold` : confiance minimale (0 à 1) pour qu'une image hors tableau reçoive le type de ses voisines ; sinon « Autres ».
 */
export async function classifyAll(threshold: number, onProgress?: (done: number, total: number) => void): Promise<ClassifyRun> {
  const started = performance.now()
  const d = await getDb()

  const blockIds = (await d.select<{ id: string }[]>('SELECT id FROM lib_blocks')).map((b) => b.id)
  const known = new Set((await d.select<{ id: string }[]>('SELECT id FROM lib_types')).map((t) => t.id))

  // Une empreinte par bloc (moyenne de ses images).
  const rows = await d.select<{ block: string; vec: string }[]>(
    'SELECT f.block_id AS block, e.vec FROM lib_embeddings e JOIN lib_files f ON f.path_rel = e.path_rel WHERE e.model = $1 AND f.missing = 0',
    [MODEL_ID],
  )
  const perBlock = new Map<string, Float32Array[]>()
  for (const r of rows) {
    const list = perBlock.get(r.block) ?? []
    list.push(decodeVector(r.vec))
    perBlock.set(r.block, list)
  }
  const vectors = new Map<string, Float32Array>()
  for (const [id, list] of perBlock) vectors.set(id, list.length === 1 ? list[0] : blockVector(list))

  // Exemples : ce que Victor a rangé (tableaux et choix à la main). Jamais le classement de l'IA.
  const typeRows = await d.select<{ block_id: string; type_id: string; origin: string }[]>('SELECT block_id, type_id, origin FROM lib_block_types')
  const labels = new Map<string, string[]>()
  const refused = new Map<string, string[]>()
  const refusedOther = new Set<string>()
  for (const r of typeRows) {
    if (r.origin === 'board' || r.origin === 'manual') labels.set(r.block_id, [...(labels.get(r.block_id) ?? []), r.type_id])
    else if (r.origin === 'removed') {
      refused.set(r.block_id, [...(refused.get(r.block_id) ?? []), r.type_id])
      if (r.type_id === OTHER_TYPE_ID) refusedOther.add(r.block_id)
    }
  }
  // Les types sans tableau ni exemple n'ont pas de voisines : seuls les types qui ont des exemples peuvent être donnés.
  const examples = buildExampleSet([...labels].filter(([id]) => vectors.has(id)).map(([id, types]) => ({ vec: vectors.get(id)!, types })))
  const queryIds = [...vectors.keys()].filter((id) => !labels.has(id))
  const dim = examples.dim
  const queries = new Float32Array(queryIds.length * dim)
  queryIds.forEach((id, i) => queries.set(vectors.get(id)!, i * dim))

  // Types décrits en mots : seulement si le modèle de texte est téléchargé et que les types existent.
  const semanticTypes = SEMANTIC_TYPES.filter((t) => known.has(t.typeId))
  const allIds = [...vectors.keys()]
  let prompts: ReturnType<typeof buildPromptMatrix> | undefined
  let all: Float32Array | undefined
  if (dim > 0 && semanticTypes.length > 0 && (await getTextStatus()).ready) {
    prompts = buildPromptMatrix(await textVectors(allPrompts()))
    all = new Float32Array(allIds.length * dim)
    allIds.forEach((id, i) => all!.set(vectors.get(id)!, i * dim))
  }

  let neighbours: Row[] = []
  let semantic: Row[] = []
  if (dim > 0) {
    const result = await new Promise<{ neighbours: Row[]; semantic: Row[] }>((resolve, reject) => {
      const worker = new Worker(new URL('./classify.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<WorkerOutput>) => {
        if (e.data.kind === 'progress') onProgress?.(e.data.done, e.data.total)
        else {
          worker.terminate()
          resolve({ neighbours: e.data.neighbours, semantic: e.data.semantic })
        }
      }
      worker.onerror = (e) => {
        worker.terminate()
        reject(new Error(e.message || 'Le classement a échoué.'))
      }
      const input: WorkerInput = {
        dim, examples, queries, queryIds, options: { ...DEFAULT_OPTIONS, threshold },
        prompts, thresholds: thresholdsOf(semanticTypes, true), strictThresholds: thresholdsOf(semanticTypes), all, allIds: prompts ? allIds : undefined, excluded: [...refused],
      }
      worker.postMessage(input)
    })
    neighbours = result.neighbours
    semantic = result.semantic
  }

  const found = [...neighbours, ...semantic]
  const typed = new Set(labels.keys())
  const completed = known.has(OTHER_TYPE_ID) ? withFallback(found, typed, blockIds, OTHER_TYPE_ID, refusedOther) : found
  const final = applyExclusive(completed, EXCLUSIVE_TYPES, typed)

  // On remplace l'ancien classement automatique ; les types rangés, choisis ou retirés par Victor ne sont jamais touchés.
  await d.execute("DELETE FROM lib_block_types WHERE origin IN ('auto', 'ai')")
  await multiInsert(
    'lib_block_types',
    ['block_id', 'type_id', 'origin', 'score'],
    final.map((r) => [r.blockId, r.typeId, 'auto', r.score]),
    { verb: 'INSERT OR IGNORE' },
  )
  const semanticIds = new Set(semanticTypes.map((t) => t.typeId))
  const semanticCounts: Record<string, number> = {}
  for (const r of final) if (semanticIds.has(r.typeId) && r.score !== null) semanticCounts[r.typeId] = (semanticCounts[r.typeId] ?? 0) + 1
  return {
    byNeighbours: new Set(neighbours.map((r) => r.blockId)).size,
    semantic: semanticCounts,
    fallback: final.length - found.length,
    examples: examples.labels.length,
    seconds: (performance.now() - started) / 1000,
  }
}

/** Nombre d'images qui n'ont aucun type : celles que le classement automatique doit encore traiter. */
export async function countUnclassified(): Promise<number> {
  const d = await getDb()
  const [row] = await d.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM lib_blocks b WHERE NOT EXISTS (SELECT 1 FROM lib_block_types t WHERE t.block_id = b.id AND t.origin <> 'removed')",
  )
  return row.n
}
