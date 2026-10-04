import { describe, expect, it } from 'vitest'
import { activateTab, closeTab, currentId, dropTabs, openTab } from './tabs'

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
