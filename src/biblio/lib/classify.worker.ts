// Calcul du classement dans un « worker » : l'interface reste fluide pendant que les voisines et les descriptions sont comparées.

import type { Row } from './classify.ts'
import { fitRidge, proposeEnsemble, type ExampleSet, type ProposeOptions } from './neighbours.ts'
import { semanticHits, type PromptMatrix } from './semantic.ts'

export interface WorkerInput {
  dim: number
  /** Images hors tableau, classées par leurs voisines parmi les exemples (n × dim). */
  examples: ExampleSet
  queries: Float32Array
  queryIds: string[]
  options: Partial<ProposeOptions>
  /** Types décrits en mots, cherchés dans TOUTES les images (absent si le modèle de texte n'est pas là). */
  prompts?: PromptMatrix
  /** Seuils bas (on garde tout ce qui les atteint) et seuils stricts (en dessous, la ligne est marquée « relaxed »). */
  thresholds?: Record<string, number>
  strictThresholds?: Record<string, number>
  all?: Float32Array
  allIds?: string[]
  /** Types refusés par Victor, par bloc. */
  excluded: [string, string[]][]
}

export type WorkerOutput =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'done'; neighbours: Row[]; semantic: Row[] }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<WorkerInput>) => void) | null; postMessage: (m: WorkerOutput) => void }

ctx.onmessage = (e) => {
  const { dim, examples, queries, queryIds, options, prompts, thresholds, strictThresholds, all, allIds, excluded } = e.data
  const excludedByBlock = new Map(excluded.map(([id, types]) => [id, new Set(types)]))
  const neighbours: Row[] = []
  const semantic: Row[] = []
  // La régression s'apprend une fois sur tous les exemples ; ensuite, chaque image est jugée par les voisines ET la régression.
  const model = examples.labels.length > 0 ? fitRidge(examples) : null
  const total = queryIds.length + (allIds?.length ?? 0)
  for (let i = 0; i < queryIds.length; i++) {
    if (!model) break
    for (const p of proposeEnsemble(queries.subarray(i * dim, (i + 1) * dim), examples, model, excludedByBlock.get(queryIds[i]), options)) {
      neighbours.push({ blockId: queryIds[i], typeId: p.typeId, score: p.score })
    }
    if (i % 250 === 0) ctx.postMessage({ kind: 'progress', done: i, total })
  }
  if (prompts && thresholds && all && allIds) {
    for (let i = 0; i < allIds.length; i++) {
      for (const hit of semanticHits(all.subarray(i * dim, (i + 1) * dim), prompts, thresholds)) {
        if (!excludedByBlock.get(allIds[i])?.has(hit.typeId)) semantic.push({ blockId: allIds[i], typeId: hit.typeId, score: hit.score, relaxed: hit.score < (strictThresholds?.[hit.typeId] ?? 0) })
      }
      if (i % 500 === 0) ctx.postMessage({ kind: 'progress', done: queryIds.length + i, total })
    }
  }
  ctx.postMessage({ kind: 'done', neighbours, semantic })
}
