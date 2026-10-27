// Ranger tout seul une image ajoutée à la main dans la bonne collection, grâce à l'IA locale : on regarde les images les plus
// ressemblantes parmi celles que Victor a déjà rangées (ses collections et ses tableaux Pinterest) et on prend la collection
// qui revient le plus. Cette partie est « pure » (rien ne touche à la base ni à l'écran) et testée automatiquement.

export interface Candidate {
  vec: ArrayLike<number>
  /** Les collections de Victor où cette image est rangée. */
  collections: readonly string[]
}

export interface Pick {
  collectionId: string
  /** Part des voisines qui sont dans cette collection (0 à 1). */
  share: number
  /** Ressemblance moyenne des meilleures voisines (0 à 1). */
  sim: number
}

export interface PickOptions {
  /** Nombre de voisines regardées. */
  k: number
  /** Ressemblance minimale de la meilleure voisine : en dessous, l'IA n'est pas sûre. */
  minSim: number
  /** Part minimale des voisines (pondérée par leur ressemblance) qui doivent être dans la même collection. */
  minShare: number
}

export const DEFAULT_PICK: PickOptions = { k: 15, minSim: 0.55, minShare: 0.4 }

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** La collection la plus probable pour une image (`query`), d'après ses voisines ; rien si l'IA n'est pas assez sûre. */
export function pickCollection(query: ArrayLike<number>, candidates: readonly Candidate[], options: PickOptions = DEFAULT_PICK): Pick | null {
  const scored = candidates
    .map((c) => ({ c, sim: dot(query, c.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, options.k)
  if (scored.length === 0 || scored[0].sim < options.minSim) return null
  const score = new Map<string, number>()
  let total = 0
  for (const { c, sim } of scored) {
    if (sim <= 0) continue
    total += sim
    for (const id of c.collections) score.set(id, (score.get(id) ?? 0) + sim)
  }
  let best: string | null = null
  let bestScore = 0
  for (const [id, s] of score) if (s > bestScore) { best = id; bestScore = s }
  if (!best || total === 0) return null
  const share = bestScore / total
  if (share < options.minShare) return null
  const top = scored.slice(0, 3)
  return { collectionId: best, share, sim: top.reduce((s, x) => s + x.sim, 0) / top.length }
}
