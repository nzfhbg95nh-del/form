import { describe, expect, it } from 'vitest'
import { averageVector, bestPerBlock, MAX_RESULTS, MIN_RESULTS, nearestBlocks, pickMatches, similarities } from './semanticSearch.ts'
import { isSearchable, searchPrompts, translateQuery } from './searchText.ts'

describe('translateQuery', () => {
  it('traduit les mots français courants', () => {
    expect(translateQuery('chaise rouge')).toBe('chair red')
    expect(translateQuery('Montre en métal')).toBe('watch metal')
  })
  it('ignore accents et majuscules', () => {
    expect(translateQuery('ÉCHARPE dorée')).toBe('scarf gold')
    expect(translateQuery('Lampe Bleue')).toBe('lamp blue')
  })
  it('les différentes écritures de t-shirt deviennent une seule', () => {
    for (const q of ['tshirt', 'T-shirt', 'tee shirt', 'tee-shirts', 'T shirt', 'tshirts']) expect(translateQuery(q)).toBe('t-shirt')
  })
  it('garde les mots inconnus tels quels (le modèle les connaît peut-être)', () => {
    expect(translateQuery('sneakers noires')).toBe('sneakers black')
    expect(translateQuery('blender render')).toBe('blender render')
  })
  it('retire les petits mots de liaison français', () => {
    expect(translateQuery('un chat avec des lunettes')).toBe('cat with glasses')
  })
  it('une requête vide ou faite de symboles donne du vide', () => {
    expect(translateQuery('   ')).toBe('')
    expect(translateQuery('!!')).toBe('')
  })
})

describe('searchPrompts et isSearchable', () => {
  it('trois formulations, ou rien', () => {
    expect(searchPrompts('chaise')).toEqual(['chair', 'a photo of chair', 'a photo of a chair'])
    expect(searchPrompts('')).toEqual([])
  })
  it('trop court : pas de recherche par contenu', () => {
    expect(isSearchable('a')).toBe(false)
    expect(isSearchable('')).toBe(false)
    expect(isSearchable('ok')).toBe(true)
    expect(isSearchable('chat')).toBe(true)
  })
})

describe('similarities', () => {
  it('produit scalaire avec chaque ligne', () => {
    const m = Float32Array.from([1, 0, 0, 1, 0.6, 0.8])
    const s = similarities(Float32Array.from([1, 0]), m, 2)
    expect([...s]).toEqual([1, 0, Math.fround(0.6)])
  })
  it('sans empreintes : rien', () => {
    expect(similarities(Float32Array.from([1, 0]), new Float32Array(0), 2).length).toBe(0)
    expect(similarities(Float32Array.from([1, 0]), new Float32Array(4), 0).length).toBe(0)
  })
})

describe('bestPerBlock', () => {
  it('un carrousel compte pour sa meilleure image', () => {
    // 4 images en 2 dimensions ; les images 0 et 1 sont le bloc 0, les images 2 et 3 le bloc 1
    const m = Float32Array.from([0, 1, 1, 0, 0.6, 0.8, 0, 1])
    const best = bestPerBlock(Float32Array.from([1, 0]), m, 2, [0, 0, 1, 1], 2)
    expect([...best]).toEqual([1, Math.fround(0.6)])
  })
  it('un bloc sans image garde -Infinity (il ne ressort jamais)', () => {
    const best = bestPerBlock(Float32Array.from([1, 0]), Float32Array.from([1, 0]), 2, [0], 2)
    expect(best[1]).toBe(-Infinity)
  })
})

describe('averageVector', () => {
  it('moyenne puis ramène à la longueur 1', () => {
    const v = averageVector([Float32Array.from([1, 0]), Float32Array.from([0, 1])])
    expect(v[0]).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(...v)).toBeCloseTo(1)
  })
})

describe('pickMatches', () => {
  // 1 000 images autour de 0,2 avec un peu de bruit, dont 40 nettement plus ressemblantes.
  const n = 1000
  const ids = Array.from({ length: n }, (_, i) => `b${i}`)
  const sims = Float32Array.from({ length: n }, (_, i) => (i < 40 ? 0.31 - i * 0.0005 : 0.2 + 0.02 * Math.sin(i * 12.9898)))
  it('garde les images nettement au-dessus de la moyenne, de la plus ressemblante à la moins ressemblante', () => {
    const out = [...pickMatches(sims, ids).entries()]
    expect(out.length).toBeGreaterThanOrEqual(40)
    expect(out.length).toBeLessThan(120)
    expect(out.slice(0, 40).every(([id]) => Number(id.slice(1)) < 40)).toBe(true)
    for (let i = 1; i < out.length; i++) expect(out[i][1]).toBeLessThanOrEqual(out[i - 1][1])
  })
  it('donne toujours au moins MIN_RESULTS images, même quand rien ne ressort', () => {
    const flat = Float32Array.from({ length: 500 }, (_, i) => 0.2 + 0.001 * Math.sin(i))
    expect(pickMatches(flat, ids.slice(0, 500)).size).toBe(MIN_RESULTS)
  })
  it('ne dépasse jamais MAX_RESULTS', () => {
    // avec 1 écart-type au lieu de 3, 1 500 images dépassent la coupure : on n'en rend que MAX_RESULTS
    const many = Float32Array.from({ length: 3000 }, (_, i) => (i < 1500 ? 0.45 : 0.1))
    expect(pickMatches(many, Array.from({ length: 3000 }, (_, i) => `x${i}`), 1).size).toBe(MAX_RESULTS)
  })
  it('une bibliothèque plus petite que MIN_RESULTS rend tout ce qu\'elle a', () => {
    expect(pickMatches(Float32Array.from([0.3, 0.2, 0.1]), ['a', 'b', 'c']).size).toBe(3)
    expect(pickMatches(new Float32Array(0), []).size).toBe(0)
  })
})

describe('nearestBlocks', () => {
  // 5 images en 2 dimensions, 3 blocs : a (images 0 et 1), b (image 2), c (images 3 et 4)
  const m = Float32Array.from([1, 0, 0.9, 0.436, 0.6, 0.8, 0, 1, 0.1, 0.995])
  const blockOf = [0, 0, 1, 2, 2]
  const ids = ['a', 'b', 'c']
  it('range les blocs du plus ressemblant au moins ressemblant, sans le bloc de l\'image elle-même', () => {
    const out = nearestBlocks(Float32Array.from([1, 0]), m, 2, blockOf, ids, 'a')
    expect(out.map((o) => o.id)).toEqual(['b', 'c'])
    expect(out[0].score).toBeGreaterThan(out[1].score)
  })
  it('un carrousel compte pour sa meilleure image', () => {
    const out = nearestBlocks(Float32Array.from([0, 1]), m, 2, blockOf, ids, 'zzz')
    expect(out[0].id).toBe('c')
    expect(out[0].score).toBeCloseTo(1)
  })
  it('limite au nombre demandé et saute les blocs à ignorer', () => {
    expect(nearestBlocks(Float32Array.from([1, 0]), m, 2, blockOf, ids, 'a', 1)).toHaveLength(1)
    expect(nearestBlocks(Float32Array.from([1, 0]), m, 2, blockOf, ids, 'a', 24, new Set(['b'])).map((o) => o.id)).toEqual(['c'])
  })
  it('un bloc sans image ne ressort jamais', () => {
    const out = nearestBlocks(Float32Array.from([1, 0]), m, 2, blockOf, ['a', 'b', 'c', 'vide'], 'a')
    expect(out.map((o) => o.id)).not.toContain('vide')
  })
})