import { describe, expect, it } from 'vitest'
import { extractIngredients, formatNumber, parseNumber, parseQuantity, scaleFactor, scaleLine } from './recipeScale'

describe('lecture des quantités', () => {
  it('lit entiers, décimaux, fractions et caractères ½', () => {
    expect(parseNumber('200')).toBe(200)
    expect(parseNumber('1,5')).toBe(1.5)
    expect(parseNumber('1.25')).toBe(1.25)
    expect(parseNumber('1/2')).toBe(0.5)
    expect(parseNumber('1 1/2')).toBe(1.5)
    expect(parseNumber('2½')).toBe(2.5)
    expect(parseNumber('½')).toBe(0.5)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1/0')).toBeNull()
  })

  it('trouve la quantité au début de la ligne seulement', () => {
    expect(parseQuantity('200 g de farine')).toMatchObject({ value: 200, rest: ' g de farine' })
    expect(parseQuantity('sel')).toBeNull()
    expect(parseQuantity('une pincée de sel')).toBeNull()
    expect(parseQuantity('Four à 180 °C')).toBeNull()
    expect(parseQuantity('2 à 3 oeufs')).toMatchObject({ value: 2, upper: 3 })
  })
})

describe('recalcul des quantités', () => {
  it('multiplie la quantité du début de ligne', () => {
    expect(scaleLine('200 g de farine', 2)).toBe('400 g de farine')
    expect(scaleLine('1,5 L de lait', 2)).toBe('3 L de lait')
    expect(scaleLine('1/2 citron', 3)).toBe('1,5 citron')
    expect(scaleLine('1 1/2 tasse de sucre', 2)).toBe('3 tasse de sucre')
    expect(scaleLine('½ cuillère de sel', 4)).toBe('2 cuillère de sel')
    expect(scaleLine('3 œufs', 1.5)).toBe('4,5 œufs')
    expect(scaleLine('2 à 3 oeufs', 2)).toBe('4 à 6 oeufs')
    expect(scaleLine('2-3 gousses d’ail', 2)).toBe('4-6 gousses d’ail')
  })

  it('laisse intactes les lignes sans quantité et les autres nombres', () => {
    expect(scaleLine('sel et poivre', 2)).toBe('sel et poivre')
    expect(scaleLine('200 g de farine, four à 180 °C', 2)).toBe('400 g de farine, four à 180 °C')
    expect(scaleLine('200 g de farine', 1)).toBe('200 g de farine')
    expect(scaleLine('200 g de farine', 0)).toBe('200 g de farine')
    expect(scaleLine('200 g de farine', NaN)).toBe('200 g de farine')
  })

  it('écrit les nombres proprement', () => {
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(1 / 3)).toBe('0,33')
    expect(formatNumber(333.333)).toBe('333')
    expect(formatNumber(12.34)).toBe('12,3')
    expect(formatNumber(0.5)).toBe('0,5')
  })

  it('calcule le facteur entre deux nombres de personnes', () => {
    expect(scaleFactor(4, 6)).toBe(1.5)
    expect(scaleFactor(4, 2)).toBe(0.5)
    expect(scaleFactor(null, 6)).toBe(1)
    expect(scaleFactor(4, undefined)).toBe(1)
    expect(scaleFactor(0, 4)).toBe(1)
  })
})

describe('lignes d’ingrédients', () => {
  const blocks = [
    { id: 'a', type: 'paragraph', content: [{ type: 'text', text: 'Introduction' }] },
    { id: 'h1', type: 'heading', content: [{ type: 'text', text: 'Ingrédients' }] },
    { id: 'i1', type: 'checkListItem', content: [{ type: 'text', text: '200 g de farine' }] },
    { id: 'i2', type: 'checkListItem', content: [{ type: 'text', text: '' }] },
    { id: 'i3', type: 'bulletListItem', content: [{ type: 'text', text: '3 œufs' }] },
    { id: 'h2', type: 'heading', content: [{ type: 'text', text: 'Étapes' }] },
    { id: 's1', type: 'numberedListItem', content: [{ type: 'text', text: '2 minutes de repos' }] },
  ]

  it('ne prend que ce qui est sous le titre « Ingrédients »', () => {
    expect(extractIngredients(blocks)).toEqual([{ id: 'i1', text: '200 g de farine' }, { id: 'i3', text: '3 œufs' }])
    expect(extractIngredients([])).toEqual([])
  })

  it('reconnaît le titre sans tenir compte des accents ni des majuscules', () => {
    const b = [{ id: 'h', type: 'heading', content: [{ type: 'text', text: 'INGRÉDIENTS (pour 4)' }] }, { id: 'x', type: 'bulletListItem', content: [{ type: 'text', text: '1 pomme' }] }]
    expect(extractIngredients(b)).toEqual([{ id: 'x', text: '1 pomme' }])
  })
})
