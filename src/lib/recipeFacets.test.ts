import { describe, expect, it } from 'vitest'
import { cuisineOf, filterScore, hasFilters, NO_FILTERS, guessCuisine, guessMoods, ingredientHits, ingredientWords, moodsOf, timeBucket } from './recipeFacets'

describe('cuisine du monde et envies', () => {
  it('devine la cuisine d’après le titre et les ingrédients', () => {
    expect(guessCuisine('Chana masala (pois chiches en sauce épicée)', ['400 g de pois chiches', '1 c. à café de garam masala'])).toBe('indienne')
    expect(guessCuisine('Baba ganoush (caviar d’aubergines)', ['2 aubergines', '2 c. à soupe de tahini'])).toBe('moyen-orient')
    expect(guessCuisine('Ramen au curry japonais', ['200 g de nouilles', '2 c. à soupe de sauce soja'])).toBe('asiatique')
    expect(guessCuisine('Aubergines à la parmigiana', ['2 aubergines', '100 g de parmesan', '1 mozzarella'])).toBe('italienne')
    expect(guessCuisine('Pain maison', ['500 g de farine', 'eau', 'sel'])).toBeNull()
  })
  it('devine les envies', () => {
    expect(guessMoods('Gratin de courge', ['1 butternut', '200 ml de crème'])).toContain('reconfortant')
    expect(guessMoods('Salade de lentilles', ['200 g de lentilles', '1 concombre'])).toContain('leger')
    expect(guessMoods('Curry rouge', ['2 piments'])).toEqual(expect.arrayContaining(['epice', 'reconfortant']))
  })
  it('une valeur choisie à la main l’emporte', () => {
    expect(cuisineOf('Chana masala', ['pois chiches'], 'francaise')).toBe('francaise')
    expect(cuisineOf('Chana masala', ['garam masala'], '')).toBe('indienne')
    expect(moodsOf('Salade', ['concombre'], ['reconfortant'])).toEqual(['reconfortant'])
    expect(moodsOf('Salade', ['concombre'], [])).toEqual(['leger'])
  })
})

describe('temps et ingrédients', () => {
  it('range le temps en trois tranches', () => {
    expect(timeBucket(25)).toBe('rapide')
    expect(timeBucket(45)).toBe('moyen')
    expect(timeBucket(90)).toBe('long')
    expect(timeBucket(null)).toBeNull()
  })
  it('« j’ai des courgettes et des pois chiches »', () => {
    const words = ingredientWords('j’ai des courgettes et des pois chiches')
    expect(words).toEqual(['courgettes', 'pois chiches'])
    expect(ingredientHits(['2 courgettes', '400 g de pois chiches'], words)).toBe(2)
    expect(ingredientHits(['1 courgette'], words)).toBe(1)
    expect(ingredientHits(['1 oignon'], words)).toBe(0)
  })
})

describe('filtres', () => {
  const f = (o: Partial<import('./recipeFacets').RecipeFacts>) => ({ minutes: 30, inSeason: ['courge'], outOfSeason: [], veg: true, cuisine: 'indienne', moods: ['reconfortant'], lines: ['1 butternut', '200 g de lentilles'], ...o })
  it('chaque filtre écarte ce qui ne correspond pas', () => {
    expect(filterScore(f({}), NO_FILTERS)).toBe(1)
    expect(filterScore(f({ outOfSeason: ['tomate'] }), { ...NO_FILTERS, season: true })).toBe(0)
    expect(filterScore(f({ minutes: 90 }), { ...NO_FILTERS, time: 'rapide' })).toBe(0)
    expect(filterScore(f({}), { ...NO_FILTERS, cuisines: ['italienne'] })).toBe(0)
    expect(filterScore(f({}), { ...NO_FILTERS, moods: ['leger', 'reconfortant'] })).toBe(1)
  })
  it('« j’ai… » compte les ingrédients trouvés', () => {
    expect(filterScore(f({}), { ...NO_FILTERS, have: 'lentilles, courgettes' })).toBe(1)
    expect(filterScore(f({}), { ...NO_FILTERS, have: 'courgettes' })).toBe(0)
    expect(hasFilters({ ...NO_FILTERS, have: 'a' })).toBe(false)
  })
})

describe('cuisine : pièges', () => {
  it('un seul ingrédient ne suffit pas ; le curry japonais est asiatique', () => {
    expect(guessCuisine('Crackers aux graines', ['50 g de graines de sésame', '50 g de lin'])).toBeNull()
    expect(guessCuisine('Curry japonais maison', ['2 carottes', '1 oignon'])).toBe('asiatique')
  })
})
