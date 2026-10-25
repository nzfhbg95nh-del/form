// Recherche par contenu : ressemblance entre la requête (encodée par le modèle de texte) et chaque image. Logique « pure ».
//
// Les ressemblances brutes ne disent pas toutes seules « ça correspond » : un nom d'auteur absurde obtient presque la même
// meilleure note qu'une vraie requête. On garde donc les images nettement au-dessus de la moyenne de la bibliothèque
// (≥ moyenne + 3 écarts-types, mesuré sur des requêtes comme « t-shirt », « montre » ou « chaise rouge »), au moins
// MIN_RESULTS et au plus MAX_RESULTS, de la plus ressemblante à la moins ressemblante.

export const MIN_RESULTS = 24
export const MAX_RESULTS = 400
export const SIGMAS = 3

/** Moyenne de plusieurs empreintes, ramenée à la longueur 1 (les formulations d'une même requête). */
export function averageVector(vectors: ArrayLike<number>[]): Float32Array {
  const dim = vectors[0]?.length ?? 0
  const out = new Float32Array(dim)
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i]
  let norm = 0
  for (let i = 0; i < dim; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < dim; i++) out[i] /= norm
  return out
}

/** Ressemblance (produit scalaire) de la requête avec chaque image ; `matrix` : n × dim, empreintes de longueur 1. */
export function similarities(query: ArrayLike<number>, matrix: Float32Array, dim: number): Float32Array {
  const n = dim === 0 ? 0 : Math.floor(matrix.length / dim)
  const out = new Float32Array(n)
  for (let j = 0; j < n; j++) {
    let s = 0
    const base = j * dim
    for (let i = 0; i < dim; i++) s += query[i] * matrix[base + i]
    out[j] = s
  }
  return out
}

/**
 * Meilleure ressemblance de chaque bloc : un carrousel compte pour sa meilleure image (il suffit qu'une image soit un t-shirt).
 * `matrix` : une empreinte par image ; `blockOf[j]` : le numéro du bloc de l'image j ; `blocks` : nombre de blocs.
 */
export function bestPerBlock(query: ArrayLike<number>, matrix: Float32Array, dim: number, blockOf: ArrayLike<number>, blocks: number): Float32Array {
  const best = new Float32Array(blocks).fill(-Infinity)
  const sims = similarities(query, matrix, dim)
  for (let j = 0; j < sims.length; j++) {
    const b = blockOf[j]
    if (sims[j] > best[b]) best[b] = sims[j]
  }
  return best
}

/**
 * Les images qui correspondent à la requête : identifiant → ressemblance, de la plus ressemblante à la moins ressemblante
 * (l'ordre de la table est l'ordre de pertinence).
 */
export function pickMatches(sims: Float32Array, ids: readonly string[], sigmas: number = SIGMAS): Map<string, number> {
  const n = Math.min(sims.length, ids.length)
  if (n === 0) return new Map()
  let mean = 0
  for (let i = 0; i < n; i++) mean += sims[i]
  mean /= n
  let variance = 0
  for (let i = 0; i < n; i++) variance += (sims[i] - mean) ** 2
  const cut = mean + sigmas * Math.sqrt(variance / n)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => sims[b] - sims[a])
  const above = order.filter((i) => sims[i] >= cut).length
  const keep = Math.min(MAX_RESULTS, Math.max(MIN_RESULTS, above), n)
  return new Map(order.slice(0, keep).map((i) => [ids[i], sims[i]]))
}

/**
 * Les blocs qui ressemblent le plus à une image : les `k` meilleurs, du plus ressemblant au moins ressemblant.
 * `excludeBlock` : le bloc de l'image elle-même (et ceux de `skip`, par exemple des fichiers introuvables).
 */
export function nearestBlocks(
  query: ArrayLike<number>,
  matrix: Float32Array,
  dim: number,
  blockOf: ArrayLike<number>,
  ids: readonly string[],
  excludeBlock: string,
  k = 24,
  skip: ReadonlySet<string> = new Set(),
): { id: string; score: number }[] {
  const best = bestPerBlock(query, matrix, dim, blockOf, ids.length)
  const out: { id: string; score: number }[] = []
  for (let b = 0; b < ids.length; b++) {
    if (ids[b] === excludeBlock || skip.has(ids[b]) || best[b] === -Infinity) continue
    out.push({ id: ids[b], score: best[b] })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k)
}