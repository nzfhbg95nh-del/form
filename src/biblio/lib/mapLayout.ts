// La carte : place chaque image sur un plan pour que les images qui se ressemblent soient proches (dans le style de UMAP).
// Étapes : (1) on réduit les empreintes de 512 nombres à 32 (analyse en composantes principales), (2) on cherche les voisines
// de chaque image, (3) on pèse les liens de voisinage, (4) on déplace les images : les voisines s'attirent, les autres se repoussent.
// Logique « pure » (rien ne touche à l'écran ni à la base), testée automatiquement ; elle tourne dans un « worker » (map.worker.ts).

export interface LayoutOptions {
  /** Nombre de voisines cherchées pour chaque image. */
  neighbours: number
  /** Nombre de passes de déplacement. */
  epochs: number
  /** Nombre de dimensions gardées avant de chercher les voisines. */
  components: number
  /** Taille de la carte (l'image la plus éloignée du centre est à `extent / 2`). */
  extent: number
  /** Images tirées au hasard qui repoussent, à chaque attraction. */
  negative: number
  seed: number
}

export const DEFAULT_LAYOUT: LayoutOptions = { neighbours: 15, epochs: 200, components: 32, extent: 4000, negative: 5, seed: 7 }

export type Progress = (phase: string, fraction: number) => void

/** Un générateur « au hasard » qui redonne toujours la même suite pour la même graine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────────────────── 1. Réduction des dimensions ─────────────────────────

/**
 * Analyse en composantes principales : `data` (n × d) devient `k` colonnes qui gardent le plus de différences entre les images.
 * Calcul par la matrice de covariance (d × d) puis itération de puissance : rapide même pour 10 000 images de 512 nombres.
 */
export function pcaProject(data: Float32Array, n: number, d: number, k: number, rand: () => number, onProgress?: Progress): Float32Array {
  k = Math.min(k, d)
  const mean = new Float64Array(d)
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += data[i * d + j]
  for (let j = 0; j < d; j++) mean[j] /= Math.max(1, n)
  const cov = new Float64Array(d * d)
  const row = new Float64Array(d)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) row[j] = data[i * d + j] - mean[j]
    for (let a = 0; a < d; a++) {
      const ra = row[a]
      const base = a * d
      for (let b = a; b < d; b++) cov[base + b] += ra * row[b]
    }
    if (onProgress && i % 500 === 0) onProgress('Analyse des images', (i / n) * 0.6)
  }
  for (let a = 0; a < d; a++) for (let b = a; b < d; b++) {
    cov[a * d + b] /= Math.max(1, n)
    cov[b * d + a] = cov[a * d + b]
  }
  const comps: Float64Array[] = []
  for (let c = 0; c < k; c++) {
    let v = new Float64Array(d)
    for (let j = 0; j < d; j++) v[j] = rand() - 0.5
    for (let it = 0; it < 60; it++) {
      const w = new Float64Array(d)
      for (let a = 0; a < d; a++) {
        let s = 0
        const base = a * d
        for (let b = 0; b < d; b++) s += cov[base + b] * v[b]
        w[a] = s
      }
      // on retire ce qui est déjà expliqué par les composantes précédentes
      for (const p of comps) {
        let dp = 0
        for (let j = 0; j < d; j++) dp += w[j] * p[j]
        for (let j = 0; j < d; j++) w[j] -= dp * p[j]
      }
      let norm = 0
      for (let j = 0; j < d; j++) norm += w[j] * w[j]
      norm = Math.sqrt(norm)
      if (norm < 1e-12) break
      for (let j = 0; j < d; j++) w[j] /= norm
      v = w
    }
    comps.push(v)
    onProgress?.('Analyse des images', 0.6 + ((c + 1) / k) * 0.4)
  }
  const out = new Float32Array(n * k)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) {
      const p = comps[c]
      let s = 0
      for (let j = 0; j < d; j++) s += (data[i * d + j] - mean[j]) * p[j]
      out[i * k + c] = s
    }
  }
  return out
}

// ───────────────────────── 2. Voisines ─────────────────────────

export interface Knn {
  /** Les voisines de chaque image (n × k), de la plus proche à la plus lointaine. */
  index: Int32Array
  /** Les distances correspondantes (pas au carré). */
  dist: Float32Array
  k: number
}

/** Les `k` plus proches voisines de chaque point (comparaison de toutes les paires, chaque paire une seule fois). */
export function knnGraph(points: Float32Array, n: number, dim: number, k: number, onProgress?: Progress): Knn {
  k = Math.min(k, Math.max(1, n - 1))
  const index = new Int32Array(n * k).fill(-1)
  const d2 = new Float32Array(n * k).fill(Infinity)
  const worst = new Float32Array(n).fill(Infinity)
  const worstAt = new Int32Array(n)
  const push = (i: number, j: number, dist: number) => {
    if (dist >= worst[i]) return
    const base = i * k
    d2[base + worstAt[i]] = dist
    index[base + worstAt[i]] = j
    let w = -1
    let at = 0
    for (let s = 0; s < k; s++) {
      if (d2[base + s] > w) {
        w = d2[base + s]
        at = s
      }
    }
    worst[i] = w
    worstAt[i] = at
  }
  for (let i = 0; i < n; i++) {
    const bi = i * dim
    for (let j = i + 1; j < n; j++) {
      const bj = j * dim
      let s = 0
      for (let c = 0; c < dim; c++) {
        const t = points[bi + c] - points[bj + c]
        s += t * t
      }
      push(i, j, s)
      push(j, i, s)
    }
    if (onProgress && i % 200 === 0) onProgress('Recherche des voisines', i / n)
  }
  // tri de chaque ligne
  const dist = new Float32Array(n * k)
  for (let i = 0; i < n; i++) {
    const order = Array.from({ length: k }, (_, s) => s).sort((a, b) => d2[i * k + a] - d2[i * k + b])
    const sortedIdx = new Int32Array(k)
    order.forEach((s, t) => {
      sortedIdx[t] = index[i * k + s]
      dist[i * k + t] = Math.sqrt(d2[i * k + s])
    })
    index.set(sortedIdx, i * k)
  }
  return { index, dist, k }
}

// ───────────────────────── 3. Poids des liens ─────────────────────────

export interface Edges {
  from: Int32Array
  to: Int32Array
  weight: Float32Array
}

/**
 * Poids de chaque lien de voisinage (la plus proche voisine compte pleinement ; les plus lointaines de moins en moins), puis
 * symétrisation : un lien existe dans les deux sens avec le même poids.
 */
export function fuzzyEdges(knn: Knn, n: number): Edges {
  const { index, dist, k } = knn
  const target = Math.log2(k)
  const weights = new Float64Array(n * k)
  for (let i = 0; i < n; i++) {
    let rho = Infinity
    for (let s = 0; s < k; s++) {
      const d = dist[i * k + s]
      if (index[i * k + s] >= 0 && d > 0 && d < rho) rho = d
    }
    if (!Number.isFinite(rho)) rho = 0
    let lo = 1e-6
    let hi = 1e3
    let sigma = 1
    for (let it = 0; it < 48; it++) {
      sigma = (lo + hi) / 2
      let sum = 0
      for (let s = 0; s < k; s++) sum += Math.exp(-Math.max(0, dist[i * k + s] - rho) / sigma)
      if (sum > target) hi = sigma
      else lo = sigma
    }
    for (let s = 0; s < k; s++) weights[i * k + s] = Math.exp(-Math.max(0, dist[i * k + s] - rho) / sigma)
  }
  const merged = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < k; s++) {
      const j = index[i * k + s]
      if (j < 0 || j === i) continue
      const w = weights[i * k + s]
      const key = i < j ? i * n + j : j * n + i
      const prev = merged.get(key)
      merged.set(key, prev === undefined ? w : prev + w - prev * w)
    }
  }
  const from = new Int32Array(merged.size)
  const to = new Int32Array(merged.size)
  const weight = new Float32Array(merged.size)
  let e = 0
  for (const [key, w] of merged) {
    from[e] = Math.floor(key / n)
    to[e] = key % n
    weight[e] = w
    e++
  }
  return { from, to, weight }
}

// ───────────────────────── 4. Déplacement ─────────────────────────

// Réglage de la courbe d'attraction (valeurs usuelles pour « distance minimale 0,1 »).
const A = 1.5769
const B = 0.8951
const clip = (v: number) => (v > 4 ? 4 : v < -4 ? -4 : v)

/** Déplace les images : les voisines s'attirent (selon le poids du lien), quelques images au hasard les repoussent. */
export function optimize(initial: Float32Array, n: number, edges: Edges, opts: Pick<LayoutOptions, 'epochs' | 'negative'>, rand: () => number, onProgress?: Progress): Float32Array {
  const y = Float32Array.from(initial)
  const m = edges.weight.length
  let wmax = 0
  for (let e = 0; e < m; e++) wmax = Math.max(wmax, edges.weight[e])
  if (wmax === 0 || n < 3) return y
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const alpha = 1 - epoch / opts.epochs
    for (let e = 0; e < m; e++) {
      if (rand() > edges.weight[e] / wmax) continue
      const i = edges.from[e]
      const j = edges.to[e]
      let dx = y[2 * i] - y[2 * j]
      let dy = y[2 * i + 1] - y[2 * j + 1]
      let d2 = dx * dx + dy * dy
      if (d2 > 0) {
        const g = (-2 * A * B * Math.pow(d2, B - 1)) / (1 + A * Math.pow(d2, B))
        const gx = clip(g * dx) * alpha
        const gy = clip(g * dy) * alpha
        y[2 * i] += gx
        y[2 * i + 1] += gy
        y[2 * j] -= gx
        y[2 * j + 1] -= gy
      }
      for (let s = 0; s < opts.negative; s++) {
        const r = Math.floor(rand() * n)
        if (r === i) continue
        dx = y[2 * i] - y[2 * r]
        dy = y[2 * i + 1] - y[2 * r + 1]
        d2 = dx * dx + dy * dy
        const g = (2 * B) / ((0.001 + d2) * (1 + A * Math.pow(d2, B)))
        y[2 * i] += clip(g * dx) * alpha
        y[2 * i + 1] += clip(g * dy) * alpha
      }
    }
    if (onProgress && epoch % 5 === 0) onProgress('Placement des images', epoch / opts.epochs)
  }
  return y
}

/** Centre la carte et la met à l'échelle : la plus grande dimension vaut `extent`. */
export function normalize(y: Float32Array, n: number, extent: number): Float32Array {
  if (n === 0) return y
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, y[2 * i])
    maxX = Math.max(maxX, y[2 * i])
    minY = Math.min(minY, y[2 * i + 1])
    maxY = Math.max(maxY, y[2 * i + 1])
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-9)
  const scale = extent / span
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const out = new Float32Array(2 * n)
  for (let i = 0; i < n; i++) {
    out[2 * i] = (y[2 * i] - cx) * scale
    out[2 * i + 1] = (y[2 * i + 1] - cy) * scale
  }
  return out
}

/**
 * La carte entière : `vectors` (n × d, une empreinte par image) devient n positions (x, y) en unités de la carte.
 * Même empreintes et même graine : toujours la même carte.
 */
export function computeLayout(vectors: Float32Array, n: number, d: number, options: Partial<LayoutOptions> = {}, onProgress?: Progress): Float32Array {
  const opts = { ...DEFAULT_LAYOUT, ...options }
  if (n === 0) return new Float32Array(0)
  if (n === 1) return new Float32Array(2)
  const rand = mulberry32(opts.seed)
  const k = Math.min(opts.components, d)
  const reduced = pcaProject(vectors, n, d, k, rand, onProgress)
  const knn = knnGraph(reduced, n, k, opts.neighbours, onProgress)
  const edges = fuzzyEdges(knn, n)
  // Départ : les deux premières composantes (la grande structure), à une échelle raisonnable.
  const start = new Float32Array(2 * n)
  let sd = 0
  for (let i = 0; i < n; i++) sd += reduced[i * k] ** 2 + reduced[i * k + (k > 1 ? 1 : 0)] ** 2
  const scale = 10 / Math.max(1e-9, Math.sqrt(sd / (2 * n)) * 3)
  for (let i = 0; i < n; i++) {
    start[2 * i] = reduced[i * k] * scale
    start[2 * i + 1] = reduced[i * k + (k > 1 ? 1 : 0)] * scale + (rand() - 0.5) * 1e-3
  }
  const placed = optimize(start, n, edges, opts, rand, onProgress)
  return normalize(placed, n, opts.extent)
}

/**
 * Place de nouvelles images sur une carte existante : chacune se met à la moyenne des positions de ses `k` plus proches
 * voisines déjà placées (comparaison des empreintes), avec un léger décalage pour ne pas se superposer.
 * `placed` : positions (x, y) des images déjà sur la carte, `placedVectors` leurs empreintes (m × d), `fresh` les nouvelles (f × d).
 */
export function placeNewcomers(placed: Float32Array, placedVectors: Float32Array, m: number, d: number, fresh: Float32Array, f: number, k = 5, jitter = 12, rand: () => number = Math.random): Float32Array {
  const out = new Float32Array(2 * f)
  if (m === 0) return out
  const kk = Math.min(k, m)
  for (let i = 0; i < f; i++) {
    const best: { j: number; s: number }[] = []
    for (let j = 0; j < m; j++) {
      let s = 0
      for (let c = 0; c < d; c++) s += fresh[i * d + c] * placedVectors[j * d + c]
      if (best.length < kk) {
        best.push({ j, s })
        best.sort((a, b) => b.s - a.s)
      } else if (s > best[kk - 1].s) {
        best[kk - 1] = { j, s }
        best.sort((a, b) => b.s - a.s)
      }
    }
    let x = 0
    let y = 0
    let w = 0
    for (const b of best) {
      const weight = Math.max(1e-6, b.s)
      x += placed[2 * b.j] * weight
      y += placed[2 * b.j + 1] * weight
      w += weight
    }
    out[2 * i] = x / w + (rand() - 0.5) * 2 * jitter
    out[2 * i + 1] = y / w + (rand() - 0.5) * 2 * jitter
  }
  return out
}

/**
 * Une empreinte par bloc : la moyenne des empreintes de ses images, remise à longueur 1.
 * `blockOf[j]` : le numéro du bloc de la j-ième image. Un bloc sans image garde une empreinte nulle.
 */
export function blockMeans(matrix: Float32Array, dim: number, blockOf: Int32Array, blocks: number): Float32Array {
  const out = new Float32Array(blocks * dim)
  for (let j = 0; j < blockOf.length; j++) {
    const base = blockOf[j] * dim
    for (let c = 0; c < dim; c++) out[base + c] += matrix[j * dim + c]
  }
  for (let b = 0; b < blocks; b++) {
    let s = 0
    for (let c = 0; c < dim; c++) s += out[b * dim + c] ** 2
    s = Math.sqrt(s)
    if (s > 0) for (let c = 0; c < dim; c++) out[b * dim + c] /= s
  }
  return out
}

// ───────────────────────── Îlots et voisines ─────────────────────────

/** Regroupe les points en `k` îlots (k-moyennes) : renvoie le centre de chaque îlot et l'îlot de chaque point. */
export function kmeans2d(xy: Float32Array, n: number, k: number, rand: () => number, iterations = 25): { centers: Float32Array; assign: Int32Array } {
  k = Math.max(1, Math.min(k, n))
  const centers = new Float32Array(2 * k)
  const assign = new Int32Array(n)
  if (n === 0) return { centers, assign }
  // départ « k-means++ » : chaque nouveau centre est tiré au hasard, de préférence loin des précédents
  const first = Math.floor(rand() * n)
  centers[0] = xy[2 * first]
  centers[1] = xy[2 * first + 1]
  const d2 = new Float64Array(n).fill(Infinity)
  for (let c = 1; c < k; c++) {
    let total = 0
    for (let i = 0; i < n; i++) {
      const dx = xy[2 * i] - centers[2 * (c - 1)]
      const dy = xy[2 * i + 1] - centers[2 * (c - 1) + 1]
      d2[i] = Math.min(d2[i], dx * dx + dy * dy)
      total += d2[i]
    }
    let r = rand() * total
    let pick = n - 1
    for (let i = 0; i < n; i++) {
      r -= d2[i]
      if (r <= 0) {
        pick = i
        break
      }
    }
    centers[2 * c] = xy[2 * pick]
    centers[2 * c + 1] = xy[2 * pick + 1]
  }
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < k; c++) {
        const dx = xy[2 * i] - centers[2 * c]
        const dy = xy[2 * i + 1] - centers[2 * c + 1]
        const d = dx * dx + dy * dy
        if (d < bd) {
          bd = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        moved = true
      }
    }
    const sum = new Float64Array(2 * k)
    const count = new Int32Array(k)
    for (let i = 0; i < n; i++) {
      sum[2 * assign[i]] += xy[2 * i]
      sum[2 * assign[i] + 1] += xy[2 * i + 1]
      count[assign[i]]++
    }
    for (let c = 0; c < k; c++) {
      if (count[c] === 0) continue
      centers[2 * c] = sum[2 * c] / count[c]
      centers[2 * c + 1] = sum[2 * c + 1] / count[c]
    }
    if (!moved) break
  }
  return { centers, assign }
}

/**
 * Donne un nom à chaque îlot : l'étiquette (type, tableau…) la plus présente dans l'îlot, de préférence celle qui le distingue du reste.
 * `labelsOf(i)` : les étiquettes de l'image i. Deux îlots ne portent pas le même nom : le second reçoit son étiquette suivante.
 */
export function labelClusters(assign: Int32Array, k: number, labelsOf: (i: number) => readonly string[], minShare = 0.2): string[] {
  const n = assign.length
  const per: Map<string, number>[] = Array.from({ length: k }, () => new Map())
  const size = new Int32Array(k)
  const global = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    size[assign[i]]++
    for (const l of labelsOf(i)) {
      per[assign[i]].set(l, (per[assign[i]].get(l) ?? 0) + 1)
      global.set(l, (global.get(l) ?? 0) + 1)
    }
  }
  const ranked = per.map((m, c) =>
    [...m]
      .map(([label, count]) => {
        const share = count / Math.max(1, size[c])
        const lift = share / ((global.get(label) ?? 1) / n)
        return { label, share, score: share * Math.min(lift, 4) }
      })
      .filter((x) => x.share >= minShare)
      .sort((a, b) => b.score - a.score),
  )
  const taken = new Set<string>()
  // les îlots les plus grands choisissent en premier
  const order = Array.from({ length: k }, (_, c) => c).sort((a, b) => size[b] - size[a])
  const out: string[] = Array(k).fill('')
  for (const c of order) {
    const pick = ranked[c].find((x) => !taken.has(x.label))
    if (pick) {
      out[c] = pick.label
      taken.add(pick.label)
    }
  }
  return out
}

/** Les `k` empreintes les plus proches de celle de l'image `from` (empreintes de longueur 1 : produit scalaire), de la plus proche à la plus lointaine. */
export function nearestByVector(vectors: Float32Array, dim: number, n: number, from: number, k: number): { index: number; score: number }[] {
  const best: { index: number; score: number }[] = []
  for (let j = 0; j < n; j++) {
    if (j === from) continue
    let s = 0
    for (let c = 0; c < dim; c++) s += vectors[from * dim + c] * vectors[j * dim + c]
    if (best.length < k) {
      best.push({ index: j, score: s })
      best.sort((a, b) => b.score - a.score)
    } else if (s > best[k - 1].score) {
      best[k - 1] = { index: j, score: s }
      best.sort((a, b) => b.score - a.score)
    }
  }
  return best
}
