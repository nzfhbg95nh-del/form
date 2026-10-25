// Types des images hors tableau : on compare une image à celles que Victor a rangées (ses tableaux et ses choix à la
// main) ; les plus proches « votent » pour leur type, avec plus de poids quand elles ressemblent beaucoup.
// Logique « pure », testée automatiquement. Mesuré sur ses images rangées : ~78 % de types justes, ~86 % pour les
// votes à 60 % de confiance ou plus, ~91 % à 80 % et ~95 % à 90 %.

export interface ExampleSet {
  dim: number
  /** Les empreintes des exemples, l'une après l'autre (n × dim). */
  matrix: Float32Array
  /** Les types de chaque exemple (un exemple peut avoir plusieurs types). */
  labels: string[][]
}

export interface Proposal {
  typeId: string
  /** De 0 à 1. */
  score: number
}

export interface ProposeOptions {
  /** Nombre de voisines qui votent. */
  k: number
  /** Plus il est grand, plus les voisines les plus ressemblantes pèsent lourd. */
  temperature: number
  /** Confiance minimale pour attribuer le meilleur type : en dessous, rien (l'image ira dans « Autres »). */
  threshold: number
  /** Confiance minimale d'un deuxième type, quand l'IA hésite entre deux (les types se ressemblent souvent : 3D et objets, art et identité de marque). */
  second: number
  /** Nombre maximal de types pour une image. */
  max: number
}

// Réglage choisi sur les images déjà rangées : 35 % pour le meilleur type et 25 % pour un deuxième donnent 96 % d'images
// rangées, avec le bon type parmi ceux donnés dans 88 % des cas (1,16 type par image) ; à 50 %, 84 % rangées pour 86 % de justesse.
export const DEFAULT_OPTIONS: ProposeOptions = { k: 15, temperature: 20, threshold: 0.35, second: 0.25, max: 2 }

/** Les votes des plus proches voisines : pour chaque type, sa part (0 à 1) du poids des voisines qui l'ont. */
export function neighbourVotes(query: ArrayLike<number>, set: ExampleSet, options: Partial<ProposeOptions> = {}): Map<string, number> {
  const o = { ...DEFAULT_OPTIONS, ...options }
  const n = set.labels.length
  const empty = new Map<string, number>()
  if (n === 0 || o.k <= 0) return empty
  const { dim, matrix } = set

  // Les k exemples les plus ressemblants.
  const k = Math.min(o.k, n)
  const topIdx = new Int32Array(k)
  const topSim = new Float32Array(k).fill(-Infinity)
  let filled = 0
  let minPos = 0
  for (let j = 0; j < n; j++) {
    const base = j * dim
    let sim = 0
    for (let i = 0; i < dim; i++) sim += query[i] * matrix[base + i]
    if (filled < k) {
      topIdx[filled] = j
      topSim[filled] = sim
      filled++
      if (filled === k) {
        minPos = 0
        for (let t = 1; t < k; t++) if (topSim[t] < topSim[minPos]) minPos = t
      }
    } else if (sim > topSim[minPos]) {
      topIdx[minPos] = j
      topSim[minPos] = sim
      minPos = 0
      for (let t = 1; t < k; t++) if (topSim[t] < topSim[minPos]) minPos = t
    }
  }

  // Le vote, pondéré par la ressemblance.
  let best = -Infinity
  for (let t = 0; t < filled; t++) if (topSim[t] > best) best = topSim[t]
  const votes = new Map<string, number>()
  let total = 0
  for (let t = 0; t < filled; t++) {
    const w = Math.exp(o.temperature * (topSim[t] - best))
    total += w
    for (const type of set.labels[topIdx[t]]) votes.set(type, (votes.get(type) ?? 0) + w)
  }
  if (total === 0) return empty
  return new Map([...votes].map(([typeId, w]) => [typeId, w / total]))
}

const byScore = (a: Proposal, b: Proposal) => b.score - a.score || (a.typeId < b.typeId ? -1 : 1)

/** Le meilleur type s'il atteint la confiance minimale (sinon rien) ; puis, jusqu'à max, les suivants qui atteignent le seuil du deuxième type. */
function keepBest(ranked: Proposal[], o: ProposeOptions): Proposal[] {
  if (ranked.length === 0 || ranked[0].score < o.threshold) return []
  return ranked.filter((p, i) => i === 0 || p.score >= o.second).slice(0, o.max)
}

/**
 * Types de cette image selon ses voisines, du plus sûr au moins sûr ; vide si aucun n'atteint la confiance minimale.
 * `excluded` : les types que Victor a déjà retirés pour cette image.
 */
export function proposeFor(query: ArrayLike<number>, set: ExampleSet, excluded: ReadonlySet<string> = new Set(), options: Partial<ProposeOptions> = {}): Proposal[] {
  const o = { ...DEFAULT_OPTIONS, ...options }
  const ranked = [...neighbourVotes(query, set, options)]
    .map(([typeId, score]) => ({ typeId, score }))
    .filter((p) => !excluded.has(p.typeId))
    .sort(byScore)
  return keepBest(ranked, o)
}

// ───────────────────────── Régression « moindres carrés » ─────────────────────────
// Un deuxième avis, calculé d'un coup par une formule exacte (pas d'itérations) : chaque type a une direction dans
// l'espace des empreintes, apprise sur les exemples. Associée aux voisines, elle range mieux : sur les images déjà
// rangées par tableau, 80,6 % de bons types (78,7 % avec les voisines seules) et, à 50 % de confiance minimale,
// 84 % des images sont rangées avec 86 % de justesse (contre 77 % rangées pour 87 % avec les seules voisines à 60 %).

export interface RidgeModel {
  dim: number
  /** Les types connus, dans l'ordre des colonnes. */
  types: string[]
  /** Moyenne des empreintes d'apprentissage (dim). */
  mean: Float64Array
  /** Poids (dim × types, ligne par ligne). */
  weights: Float64Array
  /** Part de chaque type parmi les exemples (types). */
  prior: Float64Array
}

export const RIDGE_LAMBDA = 1
export const RIDGE_TEMPERATURE = 6

/** Résout (L Lᵀ) X = B pour une matrice symétrique définie positive A (n × n) ; B est n × m. */
export function choleskySolve(a: Float64Array, n: number, b: Float64Array, m: number): Float64Array {
  const l = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j]
      for (let k = 0; k < j; k++) s -= l[i * n + k] * l[j * n + k]
      if (i === j) {
        if (s <= 0) throw new Error('matrice non définie positive')
        l[i * n + i] = Math.sqrt(s)
      } else l[i * n + j] = s / l[j * n + j]
    }
  }
  const x = new Float64Array(n * m)
  const y = new Float64Array(n)
  for (let c = 0; c < m; c++) {
    for (let i = 0; i < n; i++) {
      let s = b[i * m + c]
      for (let k = 0; k < i; k++) s -= l[i * n + k] * y[k]
      y[i] = s / l[i * n + i]
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i]
      for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k * m + c]
      x[i * m + c] = s / l[i * n + i]
    }
  }
  return x
}

/** Apprend un type par direction : W = (AᵀA + λI)⁻¹ AᵀY, sur des empreintes centrées. */
export function fitRidge(set: ExampleSet, lambda: number = RIDGE_LAMBDA): RidgeModel {
  const { dim, matrix, labels } = set
  const n = labels.length
  const types = [...new Set(labels.flat())].sort()
  const k = types.length
  const index = new Map(types.map((t, i) => [t, i]))
  const mean = new Float64Array(dim)
  for (let r = 0; r < n; r++) for (let a = 0; a < dim; a++) mean[a] += matrix[r * dim + a] / n
  const prior = new Float64Array(k)
  for (const ls of labels) for (const t of ls) prior[index.get(t)!] += 1 / n
  const gram = new Float64Array(dim * dim)
  const rhs = new Float64Array(dim * k)
  const row = new Float64Array(dim)
  for (let r = 0; r < n; r++) {
    for (let a = 0; a < dim; a++) row[a] = matrix[r * dim + a] - mean[a]
    for (let a = 0; a < dim; a++) {
      const ra = row[a]
      const base = a * dim
      for (let b = 0; b <= a; b++) gram[base + b] += ra * row[b]
      for (const t of labels[r]) rhs[a * k + index.get(t)!] += ra
    }
  }
  // Y centré : chaque colonne perd sa moyenne ; comme A est centré, AᵀY = AᵀYbrut, rien à retrancher dans rhs.
  for (let a = 0; a < dim; a++) {
    for (let b = a + 1; b < dim; b++) gram[a * dim + b] = gram[b * dim + a]
    gram[a * dim + a] += lambda
  }
  return { dim, types, mean, weights: choleskySolve(gram, dim, rhs, k), prior }
}

/** Probabilité de chaque type pour cette image (softmax des scores de la régression). */
export function ridgeProbs(query: ArrayLike<number>, model: RidgeModel, temperature: number = RIDGE_TEMPERATURE): Map<string, number> {
  const { dim, types, mean, weights, prior } = model
  const k = types.length
  const scores = new Float64Array(k)
  for (let a = 0; a < dim; a++) {
    const x = query[a] - mean[a]
    for (let c = 0; c < k; c++) scores[c] += x * weights[a * k + c]
  }
  let max = -Infinity
  for (let c = 0; c < k; c++) {
    scores[c] = (scores[c] + prior[c]) * temperature
    if (scores[c] > max) max = scores[c]
  }
  let total = 0
  for (let c = 0; c < k; c++) {
    scores[c] = Math.exp(scores[c] - max)
    total += scores[c]
  }
  return new Map(types.map((t, c) => [t, scores[c] / total]))
}

/**
 * Types de cette image : la moyenne des voisines et de la régression, du plus sûr au moins sûr ; vide si aucun
 * n'atteint la confiance minimale (l'image ira dans « Autres »).
 */
export function proposeEnsemble(
  query: ArrayLike<number>,
  set: ExampleSet,
  model: RidgeModel,
  excluded: ReadonlySet<string> = new Set(),
  options: Partial<ProposeOptions> = {},
): Proposal[] {
  const o = { ...DEFAULT_OPTIONS, ...options }
  const votes = neighbourVotes(query, set, options)
  const ridge = ridgeProbs(query, model)
  const ranked = model.types
    .map((typeId) => ({ typeId, score: ((votes.get(typeId) ?? 0) + (ridge.get(typeId) ?? 0)) / 2 }))
    .filter((p) => !excluded.has(p.typeId))
    .sort(byScore)
  return keepBest(ranked, o)
}

/** Rassemble des exemples dans la forme attendue par `proposeFor`. */
export function buildExampleSet(examples: { vec: ArrayLike<number>; types: string[] }[]): ExampleSet {
  const dim = examples[0]?.vec.length ?? 0
  const matrix = new Float32Array(examples.length * dim)
  examples.forEach((e, j) => matrix.set(e.vec as ArrayLike<number> as Float32Array, j * dim))
  return { dim, matrix, labels: examples.map((e) => e.types) }
}
