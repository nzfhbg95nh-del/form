import { describe, expect, it } from 'vitest'
import { afterRemoval, flatten, neighbour, rangeIds, withoutIds } from './blockSelection'

const doc = [{ id: 'a' }, { id: 'b', children: [{ id: 'b1' }, { id: 'b2' }] }, { id: 'c' }]

describe('sélection de blocs', () => {
  it("met les blocs à plat dans l'ordre de lecture, enfants compris", () => {
    expect(flatten(doc)).toEqual(['a', 'b', 'b1', 'b2', 'c'])
  })

  it("donne la plage entre deux blocs, dans l'ordre de la page quel que soit le sens", () => {
    const order = flatten(doc)
    expect(rangeIds(order, 'a', 'b1')).toEqual(['a', 'b', 'b1'])
    expect(rangeIds(order, 'c', 'b')).toEqual(['b', 'b1', 'b2', 'c'])
    expect(rangeIds(order, 'a', 'zzz')).toEqual([])
  })

  it('trouve le voisin sans sortir de la page', () => {
    const order = flatten(doc)
    expect(neighbour(order, 'b', 1)).toBe('b1')
    expect(neighbour(order, 'a', -1)).toBe('a')
    expect(neighbour(order, 'c', 1)).toBe('c')
  })

  it('place le curseur avant le premier bloc supprimé, sinon après', () => {
    const order = flatten(doc)
    expect(afterRemoval(order, ['b', 'b1'])).toBe('a')
    expect(afterRemoval(order, ['a', 'b'])).toBe('b1')
    expect(afterRemoval(order, order)).toBeNull()
  })

  it('retire les identifiants pour faire une copie', () => {
    const copy = withoutIds({ id: 'x', type: 'paragraph', children: [{ id: 'y', type: 'paragraph' }] }) as unknown as { id?: string; children: { id?: string }[] }
    expect(copy.id).toBeUndefined()
    expect(copy.children[0].id).toBeUndefined()
  })
})
