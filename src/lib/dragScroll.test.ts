import { describe, expect, it } from 'vitest'
import { edgeScrollSpeed, EDGE_ZONE, MAX_SPEED } from './dragScroll.ts'

describe('edgeScrollSpeed', () => {
  it('au milieu de la page, rien ne défile', () => {
    expect(edgeScrollSpeed(400, 0, 800)).toBe(0)
  })
  it('près du bord bas, la page descend ; près du bord haut, elle monte', () => {
    expect(edgeScrollSpeed(790, 0, 800)).toBeGreaterThan(0)
    expect(edgeScrollSpeed(10, 0, 800)).toBeLessThan(0)
  })
  it('plus on est près du bord, plus ça va vite', () => {
    expect(edgeScrollSpeed(795, 0, 800)).toBeGreaterThan(edgeScrollSpeed(760, 0, 800))
  })
  it('au-delà du bord (pointeur sorti de la zone), vitesse maximale', () => {
    expect(edgeScrollSpeed(900, 0, 800)).toBe(MAX_SPEED)
    expect(edgeScrollSpeed(-50, 0, 800)).toBe(-MAX_SPEED)
  })
  it('juste à l\'entrée de la bande, au moins 1 pixel par image', () => {
    expect(edgeScrollSpeed(800 - EDGE_ZONE + 1, 0, 800)).toBe(1)
  })
  it('tient compte du haut de la zone visible (barre d\'onglets au-dessus)', () => {
    expect(edgeScrollSpeed(100, 90, 800)).toBeLessThan(0)
    expect(edgeScrollSpeed(300, 90, 800)).toBe(0)
  })
  it('dans une toute petite fenêtre, la bande se réduit au tiers', () => {
    expect(edgeScrollSpeed(50, 0, 150)).toBe(0)
    expect(edgeScrollSpeed(140, 0, 150)).toBeGreaterThan(0)
  })
})
