import { describe, expect, it } from 'vitest'
import { blockMeans, computeLayout, fuzzyEdges, kmeans2d, knnGraph, labelClusters, mulberry32, nearestByVector, normalize, pcaProject, placeNewcomers } from './mapLayout.ts'

/** Des images « fictives » : `clusters` groupes d'empreintes proches les unes des autres, dans `d` dimensions. */
function blobs(clusters: number, perCluster: number, d: number, spread = 0.15, seed = 3) {
  const rand = mulberry32(seed)
  const n = clusters * perCluster
  const data = new Float32Array(n * d)
  const label: number[] = []
  const centers = Array.from({ length: clusters }, () => Array.from({ length: d }, () => rand() * 2 - 1))
  for (let c = 0; c < clusters; c++) {
    for (let p = 0; p < perCluster; p++) {
      const i = c * perCluster + p
      label.push(c)
      for (let j = 0; j < d; j++) data[i * d + j] = centers[c][j] + (rand() - 0.5) * spread
    }
  }
  return { data, n, d, label }
}

const dist2 = (y: Float32Array, i: number, j: number) => Math.hypot(y[2 * i] - y[2 * j], y[2 * i + 1] - y[2 * j + 1])

describe('pcaProject', () => {
  it('garde les directions où les images diffèrent le plus', () => {
    // Les images varient surtout selon la première dimension.
    const rand = mulberry32(1)
    const n = 200
    const d = 6
    const data = new Float32Array(n * d)
    for (let i = 0; i < n; i++) {
      data[i * d] = (rand() - 0.5) * 10
      for (let j = 1; j < d; j++) data[i * d + j] = (rand() - 0.5) * 0.1
    }
    const out = pcaProject(data, n, d, 2, mulberry32(2))
    const varOf = (c: number) => {
      let m = 0
      for (let i = 0; i < n; i++) m += out[i * 2 + c]
      m /= n
      let v = 0
      for (let i = 0; i < n; i++) v += (out[i * 2 + c] - m) ** 2
      return v / n
    }
    expect(varOf(0)).toBeGreaterThan(varOf(1) * 100)
  })
})

describe('knnGraph', () => {
  it('trouve les mêmes voisines qu\'une recherche naïve, de la plus proche à la plus lointaine', () => {
    const rand = mulberry32(5)
    const n = 60
    const dim = 4
    const pts = Float32Array.from({ length: n * dim }, () => rand())
    const knn = knnGraph(pts, n, dim, 5)
    for (const i of [0, 17, 59]) {
      const naive = Array.from({ length: n }, (_, j) => j)
        .filter((j) => j !== i)
        .map((j) => ({ j, d: Math.hypot(...Array.from({ length: dim }, (_, c) => pts[i * dim + c] - pts[j * dim + c])) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5)
      expect([...knn.index.slice(i * 5, i * 5 + 5)]).toEqual(naive.map((x) => x.j))
      expect(knn.dist[i * 5]).toBeCloseTo(naive[0].d, 4)
    }
  })

  it('un petit nombre d\'images ne casse rien (moins de voisines que demandé)', () => {
    const knn = knnGraph(Float32Array.from([0, 0, 1, 1, 2, 2]), 3, 2, 15)
    expect(knn.k).toBe(2)
    expect([...knn.index.slice(0, 2)]).toEqual([1, 2])
  })
})

describe('fuzzyEdges', () => {
  it('chaque lien existe une seule fois, avec un poids entre 0 et 1', () => {
    const { data, n, d } = blobs(2, 20, 4)
    const knn = knnGraph(data, n, d, 6)
    const e = fuzzyEdges(knn, n)
    const seen = new Set<string>()
    for (let i = 0; i < e.weight.length; i++) {
      const key = `${Math.min(e.from[i], e.to[i])}-${Math.max(e.from[i], e.to[i])}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect(e.weight[i]).toBeGreaterThan(0)
      expect(e.weight[i]).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('computeLayout', () => {
  it('rapproche les images d\'un même groupe et éloigne les groupes', () => {
    const { data, n, d, label } = blobs(4, 60, 16)
    const y = computeLayout(data, n, d, { epochs: 150 })
    let intra = 0
    let intraN = 0
    let inter = 0
    let interN = 0
    for (let i = 0; i < n; i += 3) {
      for (let j = i + 1; j < n; j += 3) {
        if (label[i] === label[j]) {
          intra += dist2(y, i, j)
          intraN++
        } else {
          inter += dist2(y, i, j)
          interN++
        }
      }
    }
    expect(intra / intraN).toBeLessThan((inter / interN) * 0.5)
  })

  it('les plus proches voisines d\'une image sont presque toutes du même groupe', () => {
    const { data, n, d, label } = blobs(5, 40, 16)
    const y = computeLayout(data, n, d, { epochs: 150 })
    let good = 0
    let total = 0
    for (let i = 0; i < n; i += 4) {
      const order = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i).sort((a, b) => dist2(y, i, a) - dist2(y, i, b)).slice(0, 5)
      for (const j of order) {
        total++
        if (label[j] === label[i]) good++
      }
    }
    expect(good / total).toBeGreaterThan(0.9)
  })

  it('même empreintes, même graine : la même carte', () => {
    const { data, n, d } = blobs(3, 30, 8)
    const a = computeLayout(data, n, d, { epochs: 40 })
    const b = computeLayout(data, n, d, { epochs: 40 })
    expect([...a]).toEqual([...b])
  })

  it('reste dans la taille demandée et ne produit aucune valeur absurde', () => {
    const { data, n, d } = blobs(3, 30, 8)
    const y = computeLayout(data, n, d, { epochs: 40, extent: 1000 })
    expect([...y].every((v) => Number.isFinite(v) && Math.abs(v) <= 500.01)).toBe(true)
  })

  it('très peu d\'images : une, deux, trois', () => {
    expect(computeLayout(new Float32Array(0), 0, 4)).toHaveLength(0)
    expect(computeLayout(Float32Array.from([1, 0, 0, 0]), 1, 4)).toHaveLength(2)
    const three = computeLayout(Float32Array.from([1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1]), 3, 4, { epochs: 20 })
    expect([...three].every(Number.isFinite)).toBe(true)
  })
})

describe('normalize', () => {
  it('centre la carte et met la plus grande dimension à la taille voulue', () => {
    const out = normalize(Float32Array.from([10, 0, 30, 5, 20, 2]), 3, 100)
    expect(Math.max(...[0, 2, 4].map((i) => out[i])) - Math.min(...[0, 2, 4].map((i) => out[i]))).toBeCloseTo(100, 4)
    expect(out[0] + out[2]).toBeCloseTo(0, 4)
  })
})

describe('placeNewcomers', () => {
  it('une nouvelle image se place près des images qui lui ressemblent', () => {
    // deux images déjà placées : une en (0,0) proche du vecteur « a », l'autre en (1000,1000) proche de « b »
    const placed = Float32Array.from([0, 0, 1000, 1000])
    const vecs = Float32Array.from([1, 0, 0, 1])
    const fresh = Float32Array.from([0.99, 0.05])
    const out = placeNewcomers(placed, vecs, 2, 2, fresh, 1, 1, 0, () => 0.5)
    expect(Math.hypot(out[0], out[1])).toBeLessThan(1)
  })
})

describe('blockMeans', () => {
  it("moyenne les images d'un bloc et remet l'empreinte à longueur 1", () => {
    const m = Float32Array.from([1, 0, 0, 1, 0, 1])
    const out = blockMeans(m, 2, Int32Array.from([0, 0, 1]), 2)
    expect(out[0]).toBeCloseTo(Math.SQRT1_2, 5)
    expect(out[1]).toBeCloseTo(Math.SQRT1_2, 5)
    expect([out[2], out[3]]).toEqual([0, 1])
  })
})

describe('kmeans2d', () => {
  it("sépare deux nuages de points éloignés", () => {
    const xy = new Float32Array(80)
    for (let i = 0; i < 20; i++) {
      xy[2 * i] = i * 0.1
      xy[2 * i + 1] = 0
      xy[2 * (20 + i)] = 1000 + i * 0.1
      xy[2 * (20 + i) + 1] = 1000
    }
    const { assign } = kmeans2d(xy, 40, 2, mulberry32(4))
    expect(new Set([...assign.slice(0, 20)]).size).toBe(1)
    expect(new Set([...assign.slice(20)]).size).toBe(1)
    expect(assign[0]).not.toBe(assign[20])
  })
})

describe('labelClusters', () => {
  it("nomme chaque îlot d'après ce qui y domine, sans répéter un nom", () => {
    // îlot 0 : 8 typo + 2 photo ; îlot 1 : 9 typo + 1 photo (même dominante) ; îlot 2 : 10 photo
    const assign = Int32Array.from([...Array(10).fill(0), ...Array(10).fill(1), ...Array(10).fill(2)])
    const labels = (i: number) => (i < 8 ? ['typo'] : i < 10 ? ['photo'] : i < 19 ? ['typo'] : ['photo'])
    const out = labelClusters(assign, 3, labels)
    expect(out[2]).toBe('photo')
    expect(new Set(out.filter(Boolean)).size).toBe(out.filter(Boolean).length)
  })
})

describe('nearestByVector', () => {
  it("classe par ressemblance, sans l'image de départ", () => {
    const v = Float32Array.from([1, 0, 0.8, 0.6, 0, 1])
    const out = nearestByVector(v, 2, 3, 0, 2)
    expect(out.map((x) => x.index)).toEqual([1, 2])
  })
})
