import { describe, expect, it } from 'vitest'
import { activateTab, closeAround, closeTab, currentId, dropTabs, duplicateTab, openTab, pinTab } from './tabs'

describe('onglets', () => {
  it("ouvre dans l'onglet actif ou dans un nouvel onglet", () => {
    const start = { ids: ['a'], active: 0 }
    expect(openTab(start, 'b')).toEqual({ ids: ['b'], active: 0 })
    expect(openTab(start, 'b', true)).toEqual({ ids: ['a', 'b'], active: 1 })
    expect(openTab({ ids: [], active: 0 }, 'x')).toEqual({ ids: ['x'], active: 0 })
  })

  it('rebascule sur un onglet déjà ouvert plutôt que de le doubler', () => {
    expect(openTab({ ids: ['a', 'b'], active: 0 }, 'b', true)).toEqual({ ids: ['a', 'b'], active: 1 })
  })

  it('ferme un onglet en gardant un onglet actif cohérent', () => {
    expect(closeTab({ ids: ['a', 'b', 'c'], active: 2 }, 2)).toEqual({ ids: ['a', 'b'], active: 1 })
    expect(closeTab({ ids: ['a', 'b', 'c'], active: 2 }, 0)).toEqual({ ids: ['b', 'c'], active: 1 })
    expect(closeTab({ ids: ['a', 'b', 'c'], active: 0 }, 0)).toEqual({ ids: ['b', 'c'], active: 0 })
    expect(currentId(closeTab({ ids: ['a'], active: 0 }, 0))).toBeNull()
  })

  it('change d\'onglet et retire les pages supprimées', () => {
    expect(currentId(activateTab({ ids: ['a', 'b'], active: 0 }, 1))).toBe('b')
    expect(activateTab({ ids: ['a'], active: 0 }, 5)).toEqual({ ids: ['a'], active: 0 })
    expect(dropTabs({ ids: ['a', 'b', 'c'], active: 1 }, ['b', 'c'])).toEqual({ ids: ['a'], active: 0 })
  })
})

describe("menu d'un onglet", () => {
  const t = { ids: ['a', 'b', 'c', 'd', 'e'], active: 3 }
  it("fermer les autres : ne reste que l'onglet cliqué, qui devient actif", () => {
    const r = closeAround(t, 1, 'others')
    expect(r.tabs).toEqual({ ids: ['b'], active: 0 })
    expect(r.closed).toEqual(['a', 'c', 'd', 'e'])
  })
  it("fermer à gauche : garde l'onglet actif s'il est à droite", () => {
    expect(closeAround(t, 2, 'left').tabs).toEqual({ ids: ['c', 'd', 'e'], active: 1 })
  })
  it("fermer à droite : si l'onglet actif est fermé, l'onglet cliqué prend sa place", () => {
    expect(closeAround(t, 1, 'right').tabs).toEqual({ ids: ['a', 'b'], active: 1 })
  })
  it('les onglets épinglés ne sont jamais fermés', () => {
    const r = closeAround(t, 4, 'others', ['a', 'c'])
    expect(r.tabs.ids).toEqual(['a', 'c', 'e'])
    expect(r.closed).toEqual(['b', 'd'])
  })
  it('rien à fermer : rien ne change', () => {
    expect(closeAround(t, 0, 'left')).toEqual({ tabs: t, closed: [] })
    expect(closeAround(t, 9, 'others')).toEqual({ tabs: t, closed: [] })
  })
  it('dupliquer : une copie juste à droite, active', () => {
    expect(duplicateTab({ ids: ['a', 'b'], active: 0 }, 0)).toEqual({ ids: ['a', 'a', 'b'], active: 1 })
  })
  it("épingler : l'onglet passe à gauche, après les épinglés, et l'onglet actif reste le même", () => {
    const r = pinTab({ ids: ['a', 'b', 'c', 'd'], active: 3 }, 2, ['a'])
    expect(r.tabs).toEqual({ ids: ['a', 'c', 'b', 'd'], active: 3 })
    expect(r.pinned).toEqual(['a', 'c'])
  })
  it('désépingler : il reste où il est', () => {
    const r = pinTab({ ids: ['a', 'b'], active: 0 }, 0, ['a'])
    expect(r.tabs.ids).toEqual(['a', 'b'])
    expect(r.pinned).toEqual([])
  })
})