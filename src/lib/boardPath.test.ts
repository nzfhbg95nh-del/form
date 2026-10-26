import { describe, expect, it } from 'vitest'
import { anchor, dedupePoints, dragHandle, itemPathD, pathBounds, pathD, penToItem } from './boardPath'
import { DEFAULT_SHAPE_STYLE } from './boardShapes'

describe('plume', () => {
  it('un clic simple donne un point d’angle, un glisser donne deux poignées opposées', () => {
    const p = dragHandle(anchor(10, 10), 30, 20)
    expect([p.ox, p.oy, p.ix, p.iy]).toEqual([20, 10, -20, -10])
    const asym = dragHandle(anchor(10, 10), 30, 20, false)
    expect([asym.ix, asym.iy]).toEqual([0, 0])
  })
  it('le tracé SVG relie les points par des courbes, et se ferme avec Z', () => {
    const pts = [anchor(0, 0), anchor(100, 0), anchor(100, 50)]
    expect(pathD(pts, false)).toBe('M 0 0 C 0 0 100 0 100 0 C 100 0 100 50 100 50')
    expect(pathD(pts, true).endsWith('Z')).toBe(true)
    expect(pathD([], false)).toBe('')
  })
  it('l’encombrement tient compte de la courbe, pas seulement des points', () => {
    const arc = [dragHandle(anchor(0, 0), 0, -100), { ...anchor(100, 0), ix: 0, iy: -100 }]
    const box = pathBounds(arc, false)
    expect(box.y).toBeLessThan(-50)
    expect(box.x).toBeCloseTo(0)
    expect(box.w).toBeCloseTo(100)
  })
  it('un double-clic ne laisse pas deux points au même endroit', () => {
    expect(dedupePoints([anchor(0, 0), anchor(10, 10), anchor(10, 10.1)])).toHaveLength(2)
  })
  it('l’élément garde ses points en proportion du cadre : l’agrandir étire le tracé', () => {
    const it = penToItem([anchor(100, 100), anchor(200, 100), anchor(200, 150)], true, DEFAULT_SHAPE_STYLE)
    expect([it.x, it.y, it.w, it.h]).toEqual([100, 100, 100, 50])
    expect(it.shape).toBe('path')
    expect(it.closed).toBe(true)
    expect(itemPathD(it, 100, 50)).toBe(pathD([anchor(0, 0), anchor(100, 0), anchor(100, 50)], true))
    expect(itemPathD(it, 200, 100)).toBe(pathD([anchor(0, 0), anchor(200, 0), anchor(200, 100)], true))
  })
  it('un tracé tout droit a quand même un cadre d’au moins 1', () => {
    const it = penToItem([anchor(0, 0), anchor(100, 0)], false, DEFAULT_SHAPE_STYLE)
    expect(it.h).toBe(1)
  })
})
