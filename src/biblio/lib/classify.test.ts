import { describe, expect, it } from 'vitest'
import { applyExclusive, blockVector, withFallback, type Row } from './classify.ts'

const unit = (...v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return Float32Array.from(v.map((x) => x / n))
}
const row = (blockId: string, typeId: string, score: number | null = 0.8): Row => ({ blockId, typeId, score })

describe('withFallback', () => {
  const all = ['a', 'b', 'c', 'd']
  it('range dans « Autres » toute image sans type, et seulement celles-là', () => {
    const out = withFallback([row('b', 'typo')], new Set(['a']), all, 'autres')
    expect(out).toEqual([row('b', 'typo'), row('c', 'autres', null), row('d', 'autres', null)])
  })
  it('une image de tableau reste dans son type, sans « Autres »', () => {
    const out = withFallback([], new Set(all), all, 'autres')
    expect(out).toEqual([])
  })
  it('une image qui a reçu un type par description n\'est pas rangée en plus dans « Autres »', () => {
    const out = withFallback([row('c', 'recette', 0.95)], new Set(), ['c'], 'autres')
    expect(out).toEqual([row('c', 'recette', 0.95)])
  })
  it('respecte le « Autres » retiré à la main', () => {
    const out = withFallback([], new Set(), ['a', 'b'], 'autres', new Set(['a']))
    expect(out).toEqual([row('b', 'autres', null)])
  })
  it('sans aucune image, rien', () => {
    expect(withFallback([], new Set(), [], 'autres')).toEqual([])
  })
  it('un type à seuil bas est gardé seulement pour une image qui n\'aurait sinon aucun type', () => {
    const found = [{ ...row('a', 'recette', 0.7), relaxed: true }, { ...row('b', 'recette', 0.7), relaxed: true }, { ...row('c', 'recette', 0.7), relaxed: true }]
    // a : rien d'autre → garde Recette ; b : déjà rangée par son tableau ; c : a déjà un type sûr trouvé par l'IA
    const out = withFallback([...found, row('c', 'photo', 0.8)], new Set(['b']), ['a', 'b', 'c', 'd'], 'autres')
    expect(out).toEqual([row('c', 'photo', 0.8), row('a', 'recette', 0.7), row('d', 'autres', null)])
  })
  it('le marqueur « seuil bas » ne ressort pas dans le résultat', () => {
    const out = withFallback([{ ...row('a', 'typo', 0.55), relaxed: true }], new Set(), ['a'], 'autres')
    expect('relaxed' in out[0]).toBe(false)
  })
})

describe('blockVector', () => {
  it('moyenne les images d\'un carrousel, puis ramène à la longueur 1', () => {
    const v = blockVector([unit(1, 0, 0), unit(0, 1, 0)])
    expect(v[0]).toBeCloseTo(Math.SQRT1_2)
    expect(v[1]).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(...v)).toBeCloseTo(1)
  })
  it('une seule image reste inchangée', () => {
    expect([...blockVector([unit(0, 0, 2)])]).toEqual([0, 0, 1])
  })
  it('des images opposées ne donnent pas de NaN', () => {
    expect([...blockVector([unit(1, 0), unit(-1, 0)])].every((x) => Number.isFinite(x))).toBe(true)
  })
})

describe('applyExclusive', () => {
  const excl = ['recette', 'autres']
  it('une image classée Recette n\'a plus que Recette', () => {
    const out = applyExclusive([row('a', 'photo', 0.8), row('a', 'recette', 0.95), row('a', 'typo', 0.8), row('b', 'photo', 0.8)], excl, new Set())
    expect(out).toEqual([row('a', 'recette', 0.95), row('b', 'photo', 0.8)])
  })
  it('même chose pour Autres', () => {
    const out = applyExclusive([row('a', 'typo', 0.9), row('a', 'autres', 0.92)], excl, new Set())
    expect(out).toEqual([row('a', 'autres', 0.92)])
  })
  it('Recette passe avant Autres', () => {
    const out = applyExclusive([row('a', 'autres', 0.95), row('a', 'recette', 0.9)], excl, new Set())
    expect(out).toEqual([row('a', 'recette', 0.9)])
  })
  it('un type exclusif ne s\'ajoute jamais à une image déjà rangée par Victor (tableau ou choix à la main)', () => {
    const out = applyExclusive([row('a', 'recette', 0.95), row('a', 'typo', 0.8), row('c', 'autres', 0.95)], excl, new Set(['a', 'c']))
    expect(out).toEqual([row('a', 'typo', 0.8)])
  })
  it('sans type exclusif, rien ne change', () => {
    const rows = [row('a', 'photo', 0.8), row('a', '3d', 0.4), row('b', 'typo', 0.9)]
    expect(applyExclusive(rows, excl, new Set())).toEqual(rows)
  })
  it('un rangement faute de mieux dans Autres reste seul', () => {
    expect(applyExclusive([row('a', 'autres', null)], excl, new Set())).toEqual([row('a', 'autres', null)])
  })
})