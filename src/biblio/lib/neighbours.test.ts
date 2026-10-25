import { describe, expect, it } from 'vitest'
import { buildExampleSet, choleskySolve, fitRidge, proposeEnsemble, proposeFor, ridgeProbs } from './neighbours.ts'

const unit = (...v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return Float32Array.from(v.map((x) => x / n))
}

// Deux paquets d'exemples : « typo » autour de l'axe X, « photo » autour de l'axe Y.
const set = buildExampleSet([
  { vec: unit(1, 0.05, 0), types: ['typo'] },
  { vec: unit(1, 0.1, 0.05), types: ['typo'] },
  { vec: unit(0.95, 0, 0.1), types: ['typo'] },
  { vec: unit(0.05, 1, 0), types: ['photo'] },
  { vec: unit(0, 1, 0.1), types: ['photo'] },
  { vec: unit(0.1, 0.95, 0.05), types: ['photo'] },
])

describe('proposeFor', () => {
  it('donne le type des exemples les plus proches', () => {
    const p = proposeFor(unit(1, 0.02, 0.02), set, new Set(), { k: 3 })
    expect(p[0].typeId).toBe('typo')
    expect(p[0].score).toBeGreaterThan(0.9)
  })
  it('ne donne rien sous le seuil de confiance : l\'image ira dans « Autres »', () => {
    // à mi-chemin entre les deux paquets : environ 50/50
    expect(proposeFor(unit(1, 1, 0), set, new Set(), { k: 6, temperature: 0, threshold: 0.6 })).toEqual([])
    expect(proposeFor(unit(1, 1, 0), set, new Set(), { k: 6, temperature: 0, threshold: 0.4 })).toHaveLength(2)
  })
  it('un deuxième type n\'est donné que s\'il atteint son propre seuil, plus bas que celui du premier', () => {
    // à mi-chemin entre les deux paquets : environ 50/50
    const both = proposeFor(unit(1, 1, 0), set, new Set(), { k: 6, temperature: 0, threshold: 0.4, second: 0.25 })
    expect(both).toHaveLength(2)
    expect(proposeFor(unit(1, 1, 0), set, new Set(), { k: 6, temperature: 0, threshold: 0.4, second: 0.6 })).toHaveLength(1)
    // si le premier n'atteint pas son seuil, rien, même si le deuxième dépasserait le seuil du deuxième
    expect(proposeFor(unit(1, 1, 0), set, new Set(), { k: 6, temperature: 0, threshold: 0.8, second: 0.25 })).toEqual([])
  })
  it('un type retiré pour cette image n\'est pas redonné', () => {
    expect(proposeFor(unit(1, 0, 0), set, new Set(['typo']), { k: 3 })).toEqual([])
  })
  it('les voisines très ressemblantes pèsent plus que les lointaines', () => {
    const hot = proposeFor(unit(1, 0.05, 0.05), set, new Set(), { k: 6, temperature: 40, threshold: 0 })
    const cold = proposeFor(unit(1, 0.05, 0.05), set, new Set(), { k: 6, temperature: 0, threshold: 0 })
    expect(hot[0].score).toBeGreaterThan(cold[0].score)
  })
  it('un exemple à plusieurs types vote pour chacun', () => {
    const multi = buildExampleSet([
      { vec: unit(1, 0, 0), types: ['art', 'typo'] },
      { vec: unit(0.98, 0.05, 0), types: ['art', 'typo'] },
    ])
    const p = proposeFor(unit(1, 0, 0), multi, new Set(), { k: 2, max: 5 })
    expect(p.map((x) => x.typeId).sort()).toEqual(['art', 'typo'])
    expect(p.every((x) => x.score > 0.99)).toBe(true)
  })
  it('limite le nombre de types et trie du plus sûr au moins sûr', () => {
    const mixed = buildExampleSet([
      { vec: unit(1, 0, 0), types: ['a'] },
      { vec: unit(1, 0.01, 0), types: ['a'] },
      { vec: unit(0.99, 0.02, 0), types: ['b'] },
      { vec: unit(0.99, 0.03, 0), types: ['c'] },
    ])
    const p = proposeFor(unit(1, 0, 0), mixed, new Set(), { k: 4, temperature: 0, threshold: 0, max: 2 })
    expect(p).toHaveLength(2)
    expect(p[0].typeId).toBe('a')
    expect(p[0].score).toBeGreaterThanOrEqual(p[1].score)
  })
  it('sans exemples, rien', () => {
    expect(proposeFor(unit(1, 0, 0), buildExampleSet([]))).toEqual([])
  })
  it('moins d\'exemples que de voisines demandées : pas de plantage', () => {
    const tiny = buildExampleSet([{ vec: unit(1, 0, 0), types: ['x'] }])
    expect(proposeFor(unit(1, 0, 0), tiny, new Set(), { k: 15 })[0]).toEqual({ typeId: 'x', score: 1 })
  })
})

describe('choleskySolve', () => {
  it('résout un petit système symétrique', () => {
    // [[4, 2], [2, 3]] · x = [10, 8]  →  x = [1.75, 1.5]
    const x = choleskySolve(Float64Array.from([4, 2, 2, 3]), 2, Float64Array.from([10, 8]), 1)
    expect(x[0]).toBeCloseTo(1.75)
    expect(x[1]).toBeCloseTo(1.5)
  })
  it('plusieurs seconds membres à la fois', () => {
    const x = choleskySolve(Float64Array.from([2, 0, 0, 5]), 2, Float64Array.from([2, 4, 10, 15]), 2)
    ;[1, 2, 2, 3].forEach((v, i) => expect(x[i]).toBeCloseTo(v))
  })
  it('refuse une matrice qui n\'est pas définie positive', () => {
    expect(() => choleskySolve(Float64Array.from([1, 2, 2, 1]), 2, Float64Array.from([1, 1]), 1)).toThrow()
  })
})

describe('régression et ensemble', () => {
  const model = fitRidge(set)
  it('connaît les types des exemples', () => {
    expect(model.types).toEqual(['photo', 'typo'])
  })
  it('donne l\'essentiel de la probabilité au bon type', () => {
    const p = ridgeProbs(unit(1, 0.05, 0.02), model)
    expect(p.get('typo')!).toBeGreaterThan(0.7)
    const q = ridgeProbs(unit(0.05, 1, 0.02), model)
    expect(q.get('photo')!).toBeGreaterThan(0.7)
  })
  it('les probabilités font 1 au total', () => {
    const p = ridgeProbs(unit(0.3, 0.6, 0.1), model)
    expect([...p.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(1)
  })
  it('l\'ensemble range une image claire et laisse de côté une image ambiguë', () => {
    expect(proposeEnsemble(unit(1, 0.05, 0.02), set, model, new Set(), { k: 3, threshold: 0.6 })[0].typeId).toBe('typo')
    expect(proposeEnsemble(unit(1, 1, 0), set, model, new Set(), { k: 6, temperature: 0, threshold: 0.8 })).toEqual([])
  })
  it('respecte les types retirés, et la limite de types', () => {
    expect(proposeEnsemble(unit(1, 0.05, 0.02), set, model, new Set(['typo']), { k: 3, threshold: 0.6 })).toEqual([])
    const out = proposeEnsemble(unit(1, 1, 0), set, model, new Set(), { k: 6, temperature: 0, threshold: 0, max: 1 })
    expect(out).toHaveLength(1)
  })
  it('apprend aussi quand un exemple a plusieurs types', () => {
    const multi = buildExampleSet([
      { vec: unit(1, 0, 0), types: ['art', 'typo'] },
      { vec: unit(0.97, 0.05, 0), types: ['art', 'typo'] },
      { vec: unit(0, 1, 0), types: ['photo'] },
      { vec: unit(0.05, 0.98, 0), types: ['photo'] },
    ])
    const m = fitRidge(multi)
    const p = ridgeProbs(unit(1, 0.02, 0), m)
    expect(p.get('art')! + p.get('typo')!).toBeGreaterThan(p.get('photo')!)
  })
})