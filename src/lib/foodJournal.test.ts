import { describe, expect, it } from 'vitest'
import data from '../data/ciqual2020.json'
import { dayKey, dayStrip, findRecipe, journalDay, parseJournal } from './foodJournal'
import { FoodIndex, loadFoods } from './nutrition'

const index = new FoodIndex(loadFoods(data as never))
const recipes = [
  { id: 'c', title: 'Chana masala (pois chiches en sauce épicée)', perServing: { kcal: 300, prot: 10, fe: 2.7 } },
  { id: 'd', title: 'Dahl de lentilles corail', perServing: { kcal: 400, prot: 20, fe: 5 } },
]

describe('suivi quotidien', () => {
  it('reconnaît une recette citée, avec le nombre de portions', () => {
    expect(findRecipe('1 portion de Chana masala', recipes)).toMatchObject({ recipe: { id: 'c' }, portions: 1 })
    expect(findRecipe('½ part de dahl de lentilles', recipes)).toMatchObject({ recipe: { id: 'd' }, portions: 0.5 })
    expect(findRecipe('Dahl de lentilles corail', recipes)).toMatchObject({ recipe: { id: 'd' }, portions: 1 })
    expect(findRecipe('1 café', recipes)).toBeNull()
  })
  it('additionne recettes et aliments du quotidien', () => {
    const day = journalDay('1 café\n1 càc de miel\n2 portions de Chana masala\n1 kiwi\n...', index, recipes)
    expect(day.lines.map((l) => l.kind)).toEqual(['food', 'food', 'recipe', 'food'])
    expect(day.lines[0].label).toMatch(/^Café/)
    expect(day.totals.prot!).toBeGreaterThan(20)
    expect(day.totals.fe!).toBeGreaterThan(5.4)
    expect(day.totals.vitc!).toBeGreaterThan(40) // le kiwi
  })
  it('dit ce qu’il ne comprend pas', () => {
    const day = journalDay('1 truc bizarre\nSel', index, recipes)
    expect(day.lines.map((l) => l.kind)).toEqual(['unknown', 'noqty'])
  })
  it('enregistrement : relit le texte des jours, ignore le reste', () => {
    expect(parseJournal(JSON.stringify({ '2026-11-23': '1 café', nimp: 'x', '2026-11-24': '  ' }))).toEqual({ '2026-11-23': '1 café' })
    expect(parseJournal('oups')).toEqual({})
  })
  it('la bande de jours', () => {
    const days = dayStrip(new Date(2026, 10, 23), 2, 2)
    expect(days.map(dayKey)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'])
  })
})
