import { describe, expect, it } from 'vitest'
import { inSeasonNames, recipeSeason, seasonOf, seasonScore } from './seasons'

describe('saisons', () => {
  it('reconnaît les produits frais et leurs mois', () => {
    expect(seasonOf('3 tomates')?.name).toBe('tomate')
    expect(seasonOf('2 courgettes')?.months).toEqual([6, 7, 8, 9])
    expect(seasonOf('1 butternut')?.months).toEqual([1, 2, 9, 10, 11, 12])
    expect(seasonOf('2 oignons')).toBeNull() // de garde, toute l'année
  })
  it('les surgelés, conserves et sauces ne dépendent pas de la saison', () => {
    expect(seasonOf('400 g de tomates concassées')).toBeNull()
    expect(seasonOf('150 g de petits pois surgelés')).toBeNull()
    expect(seasonOf('1 c. à soupe de concentré de tomate')).toBeNull()
    expect(seasonOf('100 g de sauce tomate')).toBeNull()
  })
  it('une recette d’été en novembre : hors saison', () => {
    const r = recipeSeason(['2 aubergines', '3 tomates', '1 poivron rouge', '2 oignons'], 11)
    expect(r.outOfSeason.sort()).toEqual(['aubergine', 'poivron', 'tomate'])
    expect(r.inSeason).toEqual([])
    expect(seasonScore(r)).toBeLessThan(0)
  })
  it('une recette d’hiver en novembre : de saison', () => {
    const r = recipeSeason(['1 butternut', '2 poireaux', '200 g d’épinards frais', '1 oignon'], 11)
    expect(r.inSeason.sort()).toEqual(['courge', 'poireau', 'épinards'].sort())
    expect(r.outOfSeason).toEqual([])
    expect(seasonScore(r)).toBeGreaterThan(0)
  })
  it('les produits de saison du mois', () => {
    expect(inSeasonNames(11)).toEqual(expect.arrayContaining(['chou', 'courge', 'kiwi', 'clémentines', 'poireau']))
    expect(inSeasonNames(11)).not.toContain('tomate')
    expect(inSeasonNames(7)).toEqual(expect.arrayContaining(['tomate', 'courgette', 'fraises']))
  })
})
