import { describe, expect, it } from 'vitest'
import { pickStep, type Candidate } from './voyage.ts'

const ranked: Candidate[] = Array.from({ length: 60 }, (_, i) => ({ index: 100 + i, score: 1 - i / 100 }))

describe('pickStep', () => {
  it('« plus pareil » : la plus proche pas encore vue', () => {
    expect(pickStep('same', ranked, new Set())).toBe(100)
    expect(pickStep('same', ranked, new Set([100, 101]))).toBe(102)
  })
  it('« un peu différent » : prend dans le milieu de la liste, jamais une image déjà vue', () => {
    for (let k = 0; k < 30; k++) {
      const got = pickStep('different', ranked, new Set([110]), { rand: () => k / 30 })!
      expect(got).toBeGreaterThanOrEqual(108)
      expect(got).toBeLessThan(140)
      expect(got).not.toBe(110)
    }
  })
  it('« un peu différent » : avec peu de voisines, prend ce qui reste', () => {
    expect(pickStep('different', ranked.slice(0, 3), new Set([100]), { rand: () => 0 })).toBe(101)
  })
  it('« mêmes couleurs » : la voisine à la palette la plus proche, ou rien sans information', () => {
    expect(pickStep('colors', ranked, new Set(), { colorDistance: (i) => (i === 117 ? 3 : 40) })).toBe(117)
    expect(pickStep('colors', ranked, new Set([117]), { colorDistance: (i) => (i === 117 ? 3 : i === 120 ? 9 : 40) })).toBe(120)
    expect(pickStep('colors', ranked, new Set(), { colorDistance: () => Infinity })).toBeNull()
    expect(pickStep('colors', ranked, new Set())).toBeNull()
  })
  it('« surprends-moi » : une image prise ailleurs, pas déjà vue', () => {
    expect(pickStep('surprise', ranked, new Set([5]), { far: [5, 6], rand: () => 0 })).toBe(6)
    expect(pickStep('surprise', ranked, new Set(), { far: [] })).toBeNull()
  })
})
