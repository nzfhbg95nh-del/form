import { describe, expect, it } from 'vitest'
import { itemPathD, pathBounds, pathD, penToItem, sampleCurve, type PenPoint } from './boardPath'
import { DEFAULT_SHAPE_STYLE } from './boardShapes'

const pt = (x: number, y: number, extra: Partial<PenPoint> = {}): PenPoint => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0, ...extra })

describe('tracés', () => {
  it('le tracé SVG relie les points par des courbes, et se ferme avec Z', () => {
    const pts = [pt(0, 0), pt(100, 0), pt(100, 50)]
    expect(pathD(pts, false)).toBe('M 0 0 C 0 0 100 0 100 0 C 100 0 100 50 100 50')
    expect(pathD(pts, true).endsWith('Z')).toBe(true)
    expect(pathD([], false)).toBe('')
  })
  it('l’encombrement tient compte de la courbe, pas seulement des points', () => {
    const arc = [pt(0, 0, { oy: -100 }), pt(100, 0, { iy: -100 })]
    const box = pathBounds(arc, false)
    expect(box.y).toBeLessThan(-50)
    expect(box.w).toBeCloseTo(100)
    expect(sampleCurve(arc, false).length).toBeGreaterThan(10)
  })
  it('l’élément garde ses points en proportion du cadre : l’agrandir étire le tracé', () => {
    const it = penToItem([pt(100, 100), pt(200, 100), pt(200, 150)], true, DEFAULT_SHAPE_STYLE)
    expect([it.x, it.y, it.w, it.h]).toEqual([100, 100, 100, 50])
    expect(it.shape).toBe('path')
    expect(itemPathD(it, 100, 50)).toBe(pathD([pt(0, 0), pt(100, 0), pt(100, 50)], true))
    expect(itemPathD(it, 200, 100)).toBe(pathD([pt(0, 0), pt(200, 0), pt(200, 100)], true))
  })
  it('un tracé tout droit a quand même un cadre d’au moins 1', () => {
    expect(penToItem([pt(0, 0), pt(100, 0)], false, DEFAULT_SHAPE_STYLE).h).toBe(1)
  })
})
