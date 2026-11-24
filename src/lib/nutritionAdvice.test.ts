import { describe, expect, it } from 'vitest'
import { MAIN_MEALS_SHARE, topRecipes, weekAdvice, weekReport, type PlannedMeal } from './nutritionAdvice'

const meal = (day: number, m: 'midi' | 'soir', id: string, perServing: PlannedMeal['perServing']): PlannedMeal => ({ day, meal: m, recipeId: id, title: id, perServing })
const ironPoor = { kcal: 500, prot: 15, fe: 1, vitc: 30, ca: 100, ala: 0.2, b12: 0, zn: 2, fibres: 5, sel: 1, ags: 5 }
const ironRich = { kcal: 500, prot: 25, fe: 6, vitc: 5, ca: 400, ala: 2, b12: 1, zn: 6, fibres: 15, sel: 1, ags: 5 }

describe('bilan de la semaine', () => {
  it('une journée type = moyenne d’un repas × 2, comparée à la part midi + soir des repères', () => {
    const r = weekReport([meal(0, 'midi', 'a', { prot: 20 }), meal(0, 'soir', 'b', { prot: 30 }), meal(1, 'midi', 'a', { prot: 20 })])
    expect(r.days).toBe(2)
    const prot = r.status.find((s) => s.ref.key === 'prot')!
    expect(prot.average).toBeCloseTo((70 / 3) * 2)
    expect(prot.target).toBeCloseTo(65 * MAIN_MEALS_SHARE)
  })
  it('une valeur jamais connue reste inconnue', () => {
    const r = weekReport([meal(0, 'midi', 'a', { prot: 20 })])
    expect(r.status.find((s) => s.ref.key === 'vitd')!.average).toBeNull()
  })
})

describe('conseils', () => {
  const all = [
    { id: 'dahl', title: 'Dahl', perServing: { fe: 7, prot: 20, ca: 100 } },
    { id: 'tofu', title: 'Tofu sauté', perServing: { fe: 4, prot: 25, ca: 350 } },
    { id: 'salade', title: 'Salade', perServing: { fe: 0.5, prot: 3 } },
  ]
  it('manque de fer : le dit, propose des aliments et des recettes riches en fer', () => {
    const meals = [meal(0, 'midi', 'p', ironPoor), meal(0, 'soir', 'p', ironPoor)]
    const advice = weekAdvice(weekReport(meals), meals, all, 6)
    const fer = advice.find((a) => a.id === 'fer')!
    expect(fer.level).toBe('manque')
    expect(fer.foods).toContain('lentilles')
    expect(fer.recipes!.map((r) => r.id)).toEqual(['dahl', 'tofu'])
  })
  it('fer présent mais sans vitamine C : conseille de l’associer, repas par repas', () => {
    const meals = [meal(2, 'soir', 'Chana', ironRich)]
    const a = weekAdvice(weekReport(meals), meals, all, 6).find((x) => x.id === 'fer-vitc')!
    expect(a.text).toMatch(/Chana \(mercredi soir\)/)
    expect(a.text).toMatch(/thé ou le café/)
    expect(a.foods).toContain('jus de citron')
  })
  it('oméga-3 bas : huile de colza, noix, lin', () => {
    const meals = [meal(0, 'midi', 'p', ironPoor)]
    expect(weekAdvice(weekReport(meals), meals, all, 6).find((x) => x.id === 'omega3')?.foods).toContain('huile de colza')
  })
  it('rappelle toujours la B12 et l’iode ; la vitamine D seulement en hiver', () => {
    const meals = [meal(0, 'midi', 'p', ironRich)]
    const juin = weekAdvice(weekReport(meals), meals, all, 6).map((a) => a.id)
    const novembre = weekAdvice(weekReport(meals), meals, all, 11).map((a) => a.id)
    expect(juin).toEqual(expect.arrayContaining(['b12', 'iode']))
    expect(juin).not.toContain('vitd')
    expect(novembre).toContain('vitd')
  })
  it('dit aussi ce qui va bien', () => {
    const meals = [meal(0, 'midi', 'r', ironRich), meal(0, 'soir', 'r', ironRich)]
    expect(weekAdvice(weekReport(meals), meals, all, 6)[0]).toMatchObject({ id: 'bon', level: 'bon' })
  })
  it('signale un plat qui revient trop souvent', () => {
    const meals = [0, 1, 2, 3].map((d) => meal(d, 'midi', 'Chana', ironRich))
    expect(weekAdvice(weekReport(meals), meals, all, 6).find((a) => a.id === 'variete')?.text).toMatch(/Chana revient 4 fois/)
  })
  it('énergie basse : rappelle que les accompagnements ne sont pas comptés', () => {
    const meals = [meal(0, 'midi', 'p', { ...ironRich, kcal: 300 })]
    expect(weekAdvice(weekReport(meals), meals, all, 6).find((a) => a.id === 'accompagnements')?.text).toMatch(/riz, pain/)
  })
  it('sans repas : aucun conseil', () => {
    expect(weekAdvice(weekReport([]), [], all, 6)).toEqual([])
  })
  it('les recettes déjà prévues ne sont pas reproposées', () => {
    expect(topRecipes(all, 'fe', 'mg', 3, 2, new Set(['dahl']))!.map((r) => r.id)).toEqual(['tofu'])
  })
})

describe('conseils de saison', () => {
  const all = [
    { id: 'rata', title: 'Ratatouille', perServing: { fe: 6 }, lines: ['2 aubergines', '2 courgettes', '3 tomates'] },
    { id: 'dahl', title: 'Dahl courge', perServing: { fe: 5 }, lines: ['1 butternut', '200 g de lentilles corail'] },
  ]
  const poor = { kcal: 500, prot: 15, fe: 1, vitc: 30 }
  it('en novembre : vitamine C de saison, recettes de saison, carte « de saison »', () => {
    const meals = [{ day: 0, meal: 'midi' as const, recipeId: 'x', title: 'Salade de tomates', perServing: { ...poor, fe: 4, vitc: 5 }, lines: ['4 tomates', '1 concombre'] }]
    const advice = weekAdvice(weekReport(meals), meals, all, 11)
    expect(advice.find((a) => a.id === 'fer-vitc')?.foods).toContain('kiwi')
    expect(advice.find((a) => a.id === 'fer-vitc')?.foods).not.toContain('tomate crue')
    expect(advice.find((a) => a.id === 'hors-saison')?.text).toMatch(/tomate \(Salade de tomates\) → tomates en conserve/)
    expect(advice.find((a) => a.id === 'saison')?.foods).toContain('courge')
  })
  it('les recettes proposées évitent celles d’une autre saison', () => {
    const meals = [{ day: 0, meal: 'midi' as const, recipeId: 'x', title: 'X', perServing: poor }]
    const fer = weekAdvice(weekReport(meals), meals, all, 11).find((a) => a.id === 'fer')!
    expect(fer.recipes!.map((r) => r.id)).toEqual(['dahl'])
    const ferJuillet = weekAdvice(weekReport(meals), meals, all, 7).find((a) => a.id === 'fer')!
    expect(ferJuillet.recipes!.map((r) => r.id)).toContain('rata')
  })
})
