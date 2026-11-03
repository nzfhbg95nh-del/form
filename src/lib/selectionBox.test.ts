import { describe, expect, it } from 'vitest'
import { selectionBox } from './selectionBox'

describe('rectangle de sélection d’un bloc', () => {
  it('dépasse le texte (davantage à gauche) et laisse 2 px entre deux blocs', () => {
    expect(selectionBox({ left: 100, top: 50, width: 400, height: 30 })).toEqual({ left: 90, top: 51, width: 420, height: 28 })
  })
  it('deux blocs l’un sous l’autre ont un espace de 2 px entre leurs rectangles', () => {
    const a = selectionBox({ left: 0, top: 0, width: 100, height: 30 })
    const b = selectionBox({ left: 0, top: 30, width: 100, height: 30 })
    expect(b.top - (a.top + a.height)).toBe(2)
  })
  it('ne devient jamais négatif', () => {
    expect(selectionBox({ left: 0, top: 0, width: 10, height: 1 }).height).toBe(0)
  })
})
