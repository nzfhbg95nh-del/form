import { describe, expect, it } from 'vitest'
import { parsePinned, pinnedPages, togglePinned } from './pinned'

describe('pages épinglées', () => {
  it('lit la liste enregistrée, ou une liste vide si elle est abîmée', () => {
    expect(parsePinned(null)).toEqual([])
    expect(parsePinned('pas du json')).toEqual([])
    expect(parsePinned('{"a":1}')).toEqual([])
    expect(parsePinned('["a","b","a",3,""]')).toEqual(['a', 'b'])
  })

  it('épingle à la fin et désépingle', () => {
    expect(togglePinned(['a'], 'b')).toEqual(['a', 'b'])
    expect(togglePinned(['a', 'b'], 'a')).toEqual(['b'])
    expect(togglePinned([], 'x')).toEqual(['x'])
  })

  it('ne garde que les pages qui existent encore, dans l’ordre d’épinglage', () => {
    const objects = [
      { id: 'a', deleted_at: null },
      { id: 'b', deleted_at: '2026-10-01T00:00:00Z' },
      { id: 'c', deleted_at: null },
    ]
    expect(pinnedPages(['c', 'b', 'zzz', 'a'], objects).map((o) => o.id)).toEqual(['c', 'a'])
  })
})
