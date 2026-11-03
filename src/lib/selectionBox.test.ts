import { describe, expect, it } from 'vitest'
import { coloredBox, selectionBox } from './selectionBox'

describe('rectangle de sélection d’un bloc', () => {
  it('bloc ordinaire : 6 px de chaque côté, retiré de 2 px en haut et en bas', () => {
    expect(selectionBox({ left: 100, top: 50, width: 400, height: 30 })).toEqual({ left: 94, top: 52, width: 412, height: 26 })
  })
  it('deux blocs l’un sous l’autre ont 4 px d’écart entre leurs rectangles', () => {
    const a = selectionBox({ left: 0, top: 0, width: 100, height: 30 })
    const b = selectionBox({ left: 0, top: 30, width: 100, height: 30 })
    expect(b.top - (a.top + a.height)).toBe(4)
  })
  it('ne devient jamais négatif', () => {
    expect(selectionBox({ left: 0, top: 0, width: 10, height: 1 }).height).toBe(0)
  })
  it('bloc coloré : 3 px de bleu à gauche et à droite du fond, 2 px en haut et en bas', () => {
    expect(coloredBox({ left: 100, top: 50, width: 400, height: 30 })).toEqual({ left: 97, top: 48, width: 406, height: 34 })
  })
})
