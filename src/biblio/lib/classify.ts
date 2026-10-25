// Classement automatique : règles « pures » (rien ne touche à la base ni à l'écran), testées automatiquement.
//
// Règle de Victor : les images de ses tableaux Pinterest gardent le type de leur tableau. Pour les autres images,
// l'IA ne donne un type que si elle est sûre d'elle (voisines parmi ce que Victor a rangé, ou description en mots pour
// Typo, Recette et les astuces) ; sinon l'image va dans « Autres », le fourre-tout des images intriables
// et des astuces. Il n'y a donc plus d'image « non triée ».

/** Un type attribué à un bloc par le classement automatique ; `score` est vide pour le simple rangement dans « Autres ». */
export interface Row {
  blockId: string
  typeId: string
  score: number | null
  /** Attribué avec un seuil bas : n'est gardé que si l'image n'a sinon aucun type (voir `withFallback`). */
  relaxed?: boolean
}

/** Une seule empreinte pour un carrousel : la moyenne de celles de ses images, ramenée à la longueur 1. */
export function blockVector(vecs: ArrayLike<number>[]): Float32Array {
  const dim = vecs[0]?.length ?? 0
  const out = new Float32Array(dim)
  for (const v of vecs) for (let i = 0; i < dim; i++) out[i] += v[i]
  let norm = 0
  for (let i = 0; i < dim; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < dim; i++) out[i] /= norm
  return out
}

/**
 * Complète le classement : les types attribués avec un seuil bas (`relaxed`) ne sont gardés que pour une image qui n'a
 * rien d'autre (ni tableau ou choix de Victor `typed`, ni type sûr) ; puis « Autres » reçoit toute image qui n'a toujours
 * aucun type. `refusedOther` : images dont Victor a retiré « Autres » (on ne le remet pas).
 */
export function withFallback(
  found: Row[],
  typed: ReadonlySet<string>,
  allBlockIds: Iterable<string>,
  otherTypeId: string,
  refusedOther: ReadonlySet<string> = new Set(),
): Row[] {
  const strict = found.filter((r) => !r.relaxed)
  const covered = new Set(typed)
  for (const r of strict) covered.add(r.blockId)
  const relaxedUsed = found.filter((r) => r.relaxed && !covered.has(r.blockId))
  for (const r of relaxedUsed) covered.add(r.blockId)
  const out: Row[] = [...strict, ...relaxedUsed].map(({ blockId, typeId, score }) => ({ blockId, typeId, score }))
  for (const id of allBlockIds) if (!covered.has(id) && !refusedOther.has(id)) out.push({ blockId: id, typeId: otherTypeId, score: null })
  return out
}
/**
 * Types « exclusifs » (Recette, puis Autres) : dès qu'une image en reçoit un du classement automatique, elle n'a plus
 * que celui-là. Ils ne s'ajoutent jamais à une image qui a déjà un type de Victor (tableau ou choix à la main : `typed`).
 * `exclusive` est dans l'ordre de priorité : si une image en reçoit deux, le premier gagne.
 */
export function applyExclusive(rows: Row[], exclusive: readonly string[], typed: ReadonlySet<string>): Row[] {
  const winner = new Map<string, string>()
  for (const r of rows) {
    const rank = exclusive.indexOf(r.typeId)
    if (rank < 0 || typed.has(r.blockId)) continue
    const current = winner.get(r.blockId)
    if (current === undefined || rank < exclusive.indexOf(current)) winner.set(r.blockId, r.typeId)
  }
  return rows.filter((r) => {
    if (exclusive.includes(r.typeId) && typed.has(r.blockId)) return false // pas de type exclusif sur une image déjà rangée par Victor
    const w = winner.get(r.blockId)
    return w === undefined || r.typeId === w
  })
}