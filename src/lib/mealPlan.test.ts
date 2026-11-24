import { describe, expect, it } from 'vitest'
import {
  addEntry, addWithLeftovers, clearWeek, copyEntry, copyWeek, duplicateToNext, dropMissingRecipes, emptyPlan, entriesAt, moveEntry, parsePlan, removeEntry, serializePlan, setServings, shiftWeek, weekDays, weekKey, weekLabel, weekStats,
} from './mealPlan'

const W = '2026-11-23'

describe('semaines', () => {
  it('la semaine commence le lundi, quel que soit le jour', () => {
    expect(weekKey(new Date(2026, 10, 23))).toBe(W) // lundi
    expect(weekKey(new Date(2026, 10, 29, 23, 30))).toBe(W) // dimanche soir
    expect(weekKey(new Date(2026, 10, 30))).toBe('2026-11-30')
  })
  it('passer d\'une semaine à l\'autre, y compris en changeant de mois et d\'année', () => {
    expect(shiftWeek(W, 1)).toBe('2026-11-30')
    expect(shiftWeek(W, -1)).toBe('2026-11-16')
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04')
  })
  it('les 7 jours, du lundi au dimanche', () => {
    const days = weekDays(W)
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1)
    expect(days[6].getDate()).toBe(29)
  })
  it('le titre de la semaine', () => {
    expect(weekLabel(W)).toBe('Semaine du 23 au 29 novembre')
    expect(weekLabel('2026-11-30')).toBe('Semaine du 30 novembre au 6 décembre')
    expect(weekLabel('2026-12-28')).toBe('Semaine du 28 décembre 2026 au 3 janvier 2027')
  })
})

describe('repas', () => {
  const base = addEntry(addEntry(emptyPlan(), W, 0, 'midi', 'chana', 4, 'a'), W, 0, 'soir', 'dahl', 2, 'b')
  it('ajouter dans une case', () => {
    expect(entriesAt(base, W, 0, 'midi').map((e) => e.recipeId)).toEqual(['chana'])
    expect(entriesAt(base, W, 1, 'midi')).toEqual([])
  })
  it('le nombre de personnes reste entre 1 et 20', () => {
    expect(setServings(base, W, 'a', 0).weeks[W][0].servings).toBe(1)
    expect(setServings(base, W, 'a', 99).weeks[W][0].servings).toBe(20)
    expect(setServings(base, W, 'a', 3).weeks[W][0].servings).toBe(3)
  })
  it('retirer un repas ; une semaine vide disparaît', () => {
    const p = removeEntry(removeEntry(base, W, 'a'), W, 'b')
    expect(p.weeks[W]).toBeUndefined()
  })
  it('déplacer vers une autre case, à la fin ou avant un autre repas', () => {
    const p = moveEntry(base, W, 'a', 0, 'soir')
    expect(entriesAt(p, W, 0, 'soir').map((e) => e.id)).toEqual(['b', 'a'])
    const q = moveEntry(base, W, 'a', 0, 'soir', 'b')
    expect(entriesAt(q, W, 0, 'soir').map((e) => e.id)).toEqual(['a', 'b'])
    expect(entriesAt(q, W, 0, 'midi')).toEqual([])
  })
  it('déplacer un repas inconnu ne change rien', () => {
    expect(moveEntry(base, W, 'zzz', 3, 'midi')).toBe(base)
  })
  it('copier une semaine sur une autre (nouveaux identifiants)', () => {
    let n = 0
    const p = copyWeek(base, W, shiftWeek(W, 1), () => `n${++n}`)
    expect(p.weeks[shiftWeek(W, 1)].map((e) => e.id)).toEqual(['n1', 'n2'])
    expect(p.weeks[W]).toHaveLength(2)
  })
  it('vider une semaine', () => {
    expect(clearWeek(base, W).weeks[W]).toBeUndefined()
  })
  it('une recette supprimée disparaît du planning', () => {
    const p = dropMissingRecipes(base, (id) => id !== 'dahl')
    expect(p.weeks[W].map((e) => e.recipeId)).toEqual(['chana'])
    expect(dropMissingRecipes(base, () => true)).toBe(base)
  })
  it('les chiffres de la semaine', () => {
    expect(weekStats(base, W)).toEqual({ meals: 2, servings: 6, recipes: 2 })
  })
})

describe('enregistrement', () => {
  it('relit ce qui a été écrit', () => {
    const p = addEntry(emptyPlan(), W, 6, 'soir', 'x', 2, 'id1')
    expect(parsePlan(serializePlan(p))).toEqual(p)
  })
  it('une valeur absente ou abîmée donne un planning vide', () => {
    expect(parsePlan(null)).toEqual(emptyPlan())
    expect(parsePlan('{oups')).toEqual(emptyPlan())
  })
  it('les lignes abîmées sont ignorées, les bonnes gardées', () => {
    const raw = JSON.stringify({ version: 1, weeks: { [W]: [{ id: 'ok', recipeId: 'r', day: 2, meal: 'midi', servings: 3 }, { id: 'ko', recipeId: 'r', day: 9, meal: 'midi' }, { id: 'ko2', day: 1, meal: 'brunch' }], nimp: [] } })
    expect(parsePlan(raw).weeks).toEqual({ [W]: [{ id: 'ok', recipeId: 'r', day: 2, meal: 'midi', servings: 3 }] })
  })
})

describe('restes et duplication', () => {
  const W = '2026-11-23'
  let n = 0
  const id = () => `n${++n}`
  it('cuisiner une fois pour 3 repas : la case choisie puis les 2 repas libres suivants, en restes', () => {
    let p = addEntry(emptyPlan(), W, 1, 'soir', 'autre', 1, 'x') // mardi soir déjà pris
    p = addWithLeftovers(p, W, 1, 'midi', 'dahl', 1, 3, id)
    const dahl = p.weeks[W].filter((e) => e.recipeId === 'dahl')
    expect(dahl.map((e) => [e.day, e.meal])).toEqual([[1, 'midi'], [2, 'midi'], [2, 'soir']])
    expect(dahl[0].leftoverOf).toBeUndefined()
    expect(dahl.slice(1).every((e) => e.leftoverOf === dahl[0].id)).toBe(true)
  })
  it('passe à la semaine suivante après dimanche soir', () => {
    const p = addWithLeftovers(emptyPlan(), W, 6, 'soir', 'chili', 1, 2, id)
    expect(p.weeks['2026-11-30'][0]).toMatchObject({ day: 0, meal: 'midi', recipeId: 'chili' })
  })
  it('dupliquer met le plat en restes au prochain repas libre ; Ctrl + glisser le recopie', () => {
    let p = addEntry(emptyPlan(), W, 0, 'midi', 'curry', 2, 'a')
    p = duplicateToNext(p, W, 'a', 'b')
    expect(p.weeks[W].find((e) => e.id === 'b')).toMatchObject({ day: 0, meal: 'soir', servings: 2, leftoverOf: 'a' })
    p = copyEntry(p, W, 'a', W, 4, 'midi', 'c')
    expect(p.weeks[W].find((e) => e.id === 'c')).toMatchObject({ day: 4, meal: 'midi', recipeId: 'curry' })
    expect(p.weeks[W].find((e) => e.id === 'c')?.leftoverOf).toBeUndefined()
  })
  it('les restes sont gardés à la relecture', () => {
    const p = addWithLeftovers(emptyPlan(), W, 0, 'midi', 'dahl', 1, 2, id)
    expect(parsePlan(serializePlan(p)).weeks[W][1].leftoverOf).toBe(p.weeks[W][0].id)
  })
})

describe('restes : retirer le repas cuisiné', () => {
  it('le premier repas de restes devient celui où l’on cuisine', () => {
    let k = 0
    let p = addWithLeftovers(emptyPlan(), '2026-11-23', 0, 'midi', 'dahl', 1, 3, () => `e${++k}`)
    p = removeEntry(p, '2026-11-23', 'e1')
    const [a, b] = p.weeks['2026-11-23']
    expect(a.leftoverOf).toBeUndefined()
    expect(b.leftoverOf).toBe(a.id)
  })
})
