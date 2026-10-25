import { describe, expect, it } from 'vitest'
import { clampRatio, columnCount, formatDuration, layoutMasonry, visibleIndices } from './grid.ts'

describe('columnCount', () => {
  it('au moins une colonne, même dans une fenêtre étroite', () => {
    expect(columnCount(100, 220, 12)).toBe(1)
    expect(columnCount(0, 220, 12)).toBe(1)
  })
  it('compte les colonnes avec les espaces', () => {
    expect(columnCount(1000, 220, 12)).toBe(4) // 4 × 220 + 3 × 12 = 916
    expect(columnCount(916, 220, 12)).toBe(4)
    expect(columnCount(915, 220, 12)).toBe(3)
  })
})

describe('clampRatio', () => {
  it('borne les formats extrêmes et remplace les valeurs invalides par un carré', () => {
    expect(clampRatio(10)).toBe(3)
    expect(clampRatio(0.01)).toBe(0.35)
    expect(clampRatio(0)).toBe(1)
    expect(clampRatio(NaN)).toBe(1)
    expect(clampRatio(1.5)).toBe(1.5)
  })
})

describe('layoutMasonry', () => {
  it('remplit les colonnes de gauche à droite, puis la plus courte', () => {
    const { items, columns } = layoutMasonry([1, 1, 1, 0.5], 224, 100, 24)
    // 2 colonnes de 100 px, 24 px d'espace
    expect(columns).toBe(2)
    expect(items[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    expect(items[1]).toEqual({ x: 124, y: 0, w: 100, h: 100 })
    expect(items[2]).toEqual({ x: 0, y: 124, w: 100, h: 100 })
    expect(items[3].x).toBe(124) // la colonne de droite est la plus courte (égalité → gauche, mais la gauche est plus haute)
    expect(items[3].y).toBe(124)
    expect(items[3].h).toBe(200)
  })
  it('à égalité de hauteur, la colonne de gauche passe en premier', () => {
    const { items } = layoutMasonry([1, 1, 1], 224, 100, 24)
    expect(items[2].x).toBe(0)
  })
  it('calcule la hauteur totale sans espace en trop', () => {
    expect(layoutMasonry([1, 1], 224, 100, 24).height).toBe(100)
    expect(layoutMasonry([1, 1, 1], 224, 100, 24).height).toBe(224)
  })
  it('une liste vide donne une hauteur nulle', () => {
    expect(layoutMasonry([], 500, 100, 10)).toEqual({ items: [], height: 0, columns: 4 })
  })
  it('ne dépasse jamais la largeur disponible', () => {
    const { items } = layoutMasonry(Array(50).fill(1), 1000, 220, 12)
    for (const it of items) expect(it.x + it.w).toBeLessThanOrEqual(1000.0001)
  })
})

describe('visibleIndices', () => {
  const items = [0, 1, 2, 3, 4].map((i) => ({ x: 0, y: i * 110, w: 100, h: 100 }))
  it('ne garde que les vignettes de la zone visible', () => {
    expect(visibleIndices(items, 0, 230, 0)).toEqual([0, 1, 2])
    expect(visibleIndices(items, 220, 100, 0)).toEqual([2])
  })
  it('ajoute une marge au-dessus et en dessous', () => {
    expect(visibleIndices(items, 330, 50, 120)).toEqual([1, 2, 3, 4])
  })
})

describe('formatDuration', () => {
  it('affiche minutes et secondes', () => {
    expect(formatDuration(6.33)).toBe('0:06')
    expect(formatDuration(75)).toBe('1:15')
    expect(formatDuration(-3)).toBe('0:00')
  })
})
