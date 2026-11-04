import { describe, expect, it } from 'vitest'
import { activateTab, canGo, closeAround, closeTab, currentId, dropTabs, duplicateTab, goInTab, openTab, pinTab, type Tabs } from './tabs'

describe('onglets', () => {
  it("ouvre dans l'onglet actif ou dans un nouvel onglet", () => {
    const start = { ids: ['a'], active: 0 }
    expect(openTab(start, 'b')).toEqual({ ids: ['b'], active: 0, history: [{ back: ['a'], forward: [] }] })
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

describe('historique propre à chaque onglet', () => {
  it("changer le contenu d'un onglet garde l'ancien dans son « Précédent », sans toucher aux autres onglets", () => {
    let t: Tabs = { ids: ['a', 'b'], active: 0 }
    t = openTab(t, 'c')
    expect(t.ids).toEqual(['c', 'b'])
    expect(canGo(t, 'back')).toBe(true)
    expect(t.history?.[1]).toEqual({ back: [], forward: [] })
    t = activateTab(t, 1)
    expect(canGo(t, 'back')).toBe(false)
  })
  it('Précédent puis Suivant retrouvent le contenu, onglet par onglet', () => {
    let t = openTab(openTab({ ids: ['a'], active: 0 }, 'b'), 'c')
    const back = goInTab(t, 'back')!
    expect(back.ids).toEqual(['b'])
    expect(canGo(back, 'forward')).toBe(true)
    const back2 = goInTab(back, 'back')!
    expect(back2.ids).toEqual(['a'])
    expect(goInTab(back2, 'back')).toBeNull()
    t = goInTab(back2, 'forward')!
    expect(t.ids).toEqual(['b'])
  })
  it('ouvrir autre chose après un retour efface le « Suivant »', () => {
    const t = goInTab(openTab({ ids: ['a'], active: 0 }, 'b'), 'back')!
    expect(canGo(openTab(t, 'z'), 'forward')).toBe(false)
  })
  it('les pages qui n’existent plus sont sautées', () => {
    const t = openTab(openTab(openTab({ ids: ['a'], active: 0 }, 'b'), 'c'), 'd')
    const back = goInTab(t, 'back', (id) => id !== 'c')!
    expect(back.ids).toEqual(['b'])
    expect(goInTab(openTab({ ids: ['a'], active: 0 }, 'b'), 'back', () => false)).toBeNull()
  })
  it('ouvrir la même page ne remplit pas l’historique', () => {
    const t = { ids: ['a'], active: 0 }
    expect(openTab(t, 'a')).toBe(t)
  })
  it('l’historique suit son onglet quand on ferme, duplique ou épingle', () => {
    const t = openTab(openTab({ ids: ['a', 'x', 'y'], active: 2 }, 'z'), 'w')
    expect(t.history?.[2].back).toEqual(['y', 'z'])
    expect(closeTab(t, 0).history?.[1].back).toEqual(['y', 'z'])
    const copy = duplicateTab(t, 2)
    expect(copy.history?.[3].back).toEqual(['y', 'z'])
    copy.history![3].back.push('n')
    expect(copy.history?.[2].back).toEqual(['y', 'z'])
    const pinned = pinTab(t, 2, []).tabs
    expect(pinned.ids[0]).toBe('w')
    expect(pinned.history?.[0].back).toEqual(['y', 'z'])
    expect(closeAround(t, 2, 'others').tabs.history).toEqual([{ back: ['y', 'z'], forward: [] }])
  })
})