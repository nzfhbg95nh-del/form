import { describe, expect, it } from 'vitest'
import {
  addEntry, clearWeek, copyWeek, dropMissingRecipes, emptyPlan, entriesAt, moveEntry, parsePlan, removeEntry, serializePlan, setServings, shiftWeek, weekDays, weekKey, weekLabel, weekStats,
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
