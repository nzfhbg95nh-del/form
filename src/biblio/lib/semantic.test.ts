import { describe, expect, it } from 'vitest'
import { allPrompts, buildPromptMatrix, CONTRAST_PROMPTS, SEMANTIC_TYPES, semanticHits, thresholdsOf, type PromptMatrix } from './semantic.ts'

const unit = (...v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return Float32Array.from(v.map((x) => x / n))
}

// Un monde à 3 dimensions : l'axe X « ressemble à Typo », l'axe Y à « Recette », l'axe Z au contraste.
function tiny(): PromptMatrix {
  const matrix = Float32Array.from([...unit(1, 0, 0), ...unit(0, 1, 0), ...unit(0, 0, 1)])
  return { dim: 3, matrix, groups: ['typo', 'recette', ''] }
}
const thresholds = { typo: 0.7, recette: 0.9 }

describe('semanticHits', () => {
  it('donne le type dont la description ressemble le plus à l\'image', () => {
    const hits = semanticHits(unit(1, 0.05, 0.05), tiny(), thresholds)
    expect(hits.map((h) => h.typeId)).toEqual(['typo'])
    expect(hits[0].score).toBeGreaterThan(0.9)
  })
  it('ne donne rien quand la description de contraste ressemble davantage', () => {
    expect(semanticHits(unit(0.1, 0.1, 1), tiny(), thresholds)).toEqual([])
  })
  it('respecte le seuil propre à chaque type', () => {
    // à mi-chemin entre Typo et le contraste : environ 50 % pour chacun, donc sous 0,7
    expect(semanticHits(unit(1, 0, 1), tiny(), thresholds)).toEqual([])
    expect(semanticHits(unit(1, 0, 1), tiny(), { typo: 0.4 }).map((h) => h.typeId)).toEqual(['typo'])
  })
  it('un type sans seuil connu n\'est jamais attribué', () => {
    expect(semanticHits(unit(1, 0, 0), tiny(), {})).toEqual([])
  })
  it('les probabilités des types restent entre 0 et 1', () => {
    for (const v of [unit(1, 1, 1), unit(1, 0, 0), unit(-1, -1, -1), unit(0.2, 0.9, 0.1)]) {
      for (const h of semanticHits(v, tiny(), { typo: 0, recette: 0 })) {
        expect(h.score).toBeGreaterThanOrEqual(0)
        expect(h.score).toBeLessThanOrEqual(1)
      }
    }
  })
  it('plusieurs descriptions d\'un même type s\'additionnent', () => {
    const two: PromptMatrix = { dim: 3, matrix: Float32Array.from([...unit(1, 0, 0), ...unit(0.9, 0.1, 0), ...unit(0, 0, 1)]), groups: ['typo', 'typo', ''] }
    const one = semanticHits(unit(1, 0, 0.8), tiny(), { typo: 0 })[0].score
    const both = semanticHits(unit(1, 0, 0.8), two, { typo: 0 })[0].score
    expect(both).toBeGreaterThan(one)
  })
  it('sans description, rien', () => {
    expect(semanticHits(unit(1, 0, 0), { dim: 3, matrix: new Float32Array(0), groups: [] }, thresholds)).toEqual([])
  })
  it('ne plante pas avec des nombres extrêmes', () => {
    const hits = semanticHits(Float32Array.from([1000, 0, 0]), tiny(), thresholds)
    expect(hits.every((h) => Number.isFinite(h.score))).toBe(true)
  })
})

describe('réglages', () => {
  it('chaque type décrit a plusieurs descriptions et un seuil sensé', () => {
    for (const t of SEMANTIC_TYPES) {
      expect(t.prompts.length).toBeGreaterThanOrEqual(5)
      expect(t.threshold).toBeGreaterThanOrEqual(0.5)
      expect(t.threshold).toBeLessThan(1)
    }
    expect(SEMANTIC_TYPES.map((t) => t.typeId)).toEqual(['typo', 'recette', 'autres'])
  })
  it('aucune description en double (le cache en base les retrouve par leur texte)', () => {
    const all = allPrompts()
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(SEMANTIC_TYPES.reduce((n, t) => n + t.prompts.length, 0) + CONTRAST_PROMPTS.length)
  })
  it('l\'assemblage respecte l\'ordre : types puis contraste', () => {
    const vectors = new Map(allPrompts().map((p, i) => [p, unit(1, i + 1, 0)]))
    const pm = buildPromptMatrix(vectors)
    expect(pm.groups.length).toBe(allPrompts().length)
    expect(pm.groups.slice(0, 6)).toEqual(Array(6).fill('typo'))
    expect(pm.groups.slice(-CONTRAST_PROMPTS.length)).toEqual(Array(CONTRAST_PROMPTS.length).fill(''))
    expect(thresholdsOf()).toEqual({ typo: 0.7, recette: 0.9, autres: 0.9 })
    expect(thresholdsOf(undefined, true)).toEqual({ typo: 0.5, recette: 0.65, autres: 0.9 })
  })
})
