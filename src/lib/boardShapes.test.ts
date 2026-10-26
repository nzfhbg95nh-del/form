import { describe, expect, it } from 'vitest'
import { cornerRadius, dashArray, DEFAULT_SHAPE_STYLE, polygonPoints, restyleShape, shapeAt, shapeFromDrag, shapeStyleOf, starPoints } from './boardShapes'
import type { BoardItem } from './moodboard'

describe('formes', () => {
  it('un polygone a le bon nombre de sommets, le premier en haut au milieu', () => {
    const pts = polygonPoints(100, 100, 5)
    expect(pts).toHaveLength(5)
    expect(pts[0]).toEqual([50, 0])
    expect(polygonPoints(100, 100, 2)).toHaveLength(3)
    expect(polygonPoints(100, 100, 40)).toHaveLength(12)
  })
  it('une étoile alterne pointes et creux', () => {
    const pts = starPoints(100, 100, 5, 0.5)
    expect(pts).toHaveLength(10)
    expect(pts[0]).toEqual([50, 0])
    const [cx, cy] = [50, 50]
    const r = (p: [number, number]) => Math.hypot(p[0] - cx, p[1] - cy)
    expect(r(pts[1])).toBeCloseTo(25, 0)
    expect(r(pts[0])).toBeCloseTo(50, 0)
  })
  it('les tirets dépendent de l’épaisseur ; pas de tirets sans trait', () => {
    expect(dashArray('solid', 4)).toBeUndefined()
    expect(dashArray('dashed', 4)).toBe('12 8')
    expect(dashArray('dotted', 0)).toBeUndefined()
    expect(dashArray('dotted', 4)).toBe('0.01 8')
  })
  it('le rayon des coins ne dépasse pas la moitié du plus petit côté', () => {
    expect(cornerRadius(100, 60, 200)).toBe(30)
    expect(cornerRadius(-5, 60, 200)).toBe(0)
  })
  it('une ancienne forme « remplie » garde son remplissage', () => {
    const old: BoardItem = { id: 's', kind: 'shape', x: 0, y: 0, w: 10, h: 10, shape: 'rect', color: '#ff0000', filled: true }
    expect(shapeStyleOf(old).fill).toBe('#ff0000')
    expect(shapeStyleOf({ ...old, filled: false }).fill).toBe('none')
    const recolored = restyleShape(old, { color: '#00ff00' })
    expect(shapeStyleOf(recolored).fill).toBe('#00ff00')
  })
  it('glisser crée une forme à la taille tirée ; Maj en fait un carré', () => {
    const it = shapeFromDrag({ x: 10, y: 20, w: 100, h: 40 }, DEFAULT_SHAPE_STYLE)
    expect([it.x, it.y, it.w, it.h]).toEqual([10, 20, 100, 40])
    const sq = shapeFromDrag({ x: 10, y: 20, w: 100, h: 40 }, DEFAULT_SHAPE_STYLE, true)
    expect([sq.w, sq.h]).toEqual([100, 100])
  })
  it('un clic pose une forme de taille par défaut, centrée', () => {
    const it = shapeAt({ x: 100, y: 100 }, { ...DEFAULT_SHAPE_STYLE, shape: 'star' })
    expect(it.x + it.w / 2).toBe(100)
    expect(it.shape).toBe('star')
  })
})
