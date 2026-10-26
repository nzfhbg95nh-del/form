import { describe, expect, it } from 'vitest'
import { anchor, dragHandle, penToItem, sampleCurve } from './boardPath'
import { constrainAngle, endpointAt, insertAnchor, isSmooth, moveAnchors, moveHandle, nearestOnPath, rebuildPathItem, removeAnchorFit, removeAnchors, removeAnchorsFit, reshapeSegment, worldPoints } from './boardPathEdit'
import { DEFAULT_SHAPE_STYLE } from './boardShapes'

describe('modifier un tracé de plume', () => {
  const arc = () => [dragHandle(anchor(0, 0), 50, -50), { ...anchor(100, 0), ix: -50, iy: -50 }]
  it('un point avec deux poignées opposées est lisse', () => {
    expect(isSmooth(dragHandle(anchor(0, 0), 10, 5))).toBe(true)
    expect(isSmooth(anchor(0, 0))).toBe(false)
    expect(isSmooth({ ...anchor(0, 0), ix: -10, iy: 0, ox: 0, oy: 10 })).toBe(false)
  })
  it('déplacer un point emmène ses poignées', () => {
    const out = moveAnchors(arc(), new Set([0]), 10, 20)
    expect([out[0].x, out[0].y, out[0].ox, out[0].oy]).toEqual([10, 20, 50, -50])
    expect(out[1].x).toBe(100)
  })
  it('tirer une poignée d’un point lisse fait pivoter l’autre sans changer sa longueur ; Alt la laisse en place', () => {
    const p = dragHandle(anchor(0, 0), 30, 0)
    const [out] = moveHandle([p], 0, 'out', 0, 40)
    expect([out.ox, out.oy]).toEqual([0, 40])
    expect(out.ix).toBeCloseTo(0)
    expect(out.iy).toBeCloseTo(-30)
    const [alt] = moveHandle([p], 0, 'out', 0, 40, true)
    expect(alt.ix).toBe(-30)
    expect(alt.iy).toBeCloseTo(0)
  })
  it('le tracé reconstruit garde les mêmes points sur la toile (rotation comprise)', () => {
    const it = penToItem([anchor(100, 100), anchor(200, 100), anchor(200, 150)], true, DEFAULT_SHAPE_STYLE)
    const turned = { ...it, rot: 90 }
    const pts = worldPoints(turned)
    const rebuilt = rebuildPathItem(turned, pts)
    const back = worldPoints(rebuilt)
    pts.forEach((p, i) => {
      expect(back[i].x).toBeCloseTo(p.x)
      expect(back[i].y).toBeCloseTo(p.y)
    })
    expect(rebuilt.rot).toBeUndefined()
  })
  it('ajouter un point ne change pas la forme de la courbe', () => {
    const before = sampleCurve(arc(), false, 50)
    const { pts, index } = insertAnchor(arc(), false, 0, 0.5)
    expect(pts).toHaveLength(3)
    expect(index).toBe(1)
    const after = sampleCurve(pts, false, 25)
    const near = (p: { x: number; y: number }) => Math.min(...before.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))
    expect(Math.max(...after.map(near))).toBeLessThan(0.5)
  })
  it('ajouter un point sur le segment de retour d’un tracé fermé le met en dernier', () => {
    const closed = [anchor(0, 0), anchor(100, 0), anchor(100, 100)]
    const { pts, index } = insertAnchor(closed, true, 2, 0.5)
    expect(pts).toHaveLength(4)
    expect(index).toBe(3)
  })
  it('trouve le segment le plus proche', () => {
    const hit = nearestOnPath([anchor(0, 0), anchor(100, 0), anchor(100, 100)], false, { x: 100, y: 60 })
    expect(hit?.seg).toBe(1)
    expect(hit?.dist).toBeLessThan(2)
  })
  it('tirer sur la courbe la fait passer par la souris', () => {
    const out = reshapeSegment([anchor(0, 0), anchor(100, 0)], 0, 0.5, 0, 30)
    expect(sampleCurve(out, false, 2)[1].y).toBeCloseTo(30, 0)
  })
  it('retirer des points, angle à 45°, bouts du tracé', () => {
    expect(removeAnchors([anchor(0, 0), anchor(1, 1), anchor(2, 2)], new Set([1]))).toHaveLength(2)
    const c = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 10 })
    expect(c.y).toBeCloseTo(0)
    expect(c.x).toBeCloseTo(Math.hypot(100, 10))
    expect(endpointAt([anchor(0, 0), anchor(50, 0), anchor(100, 0)], false, { x: 98, y: 1 }, 5)).toBe(2)
    expect(endpointAt([anchor(0, 0), anchor(50, 0), anchor(100, 0)], true, { x: 98, y: 1 }, 5)).toBe(-1)
  })
})

describe('supprimer un point en gardant la forme', () => {
  it('deux segments droits n’en font plus qu’un', () => {
    const out = removeAnchorFit([anchor(0, 0), anchor(50, 0), anchor(100, 0)], false, 1)
    expect(out).toHaveLength(2)
    expect(out[0].ox).toBe(0)
    expect(out[1].ix).toBe(0)
  })
  it('un point retiré au milieu d’un arc : la nouvelle courbe reste proche de l’ancienne', () => {
    // un quart de cercle coupé en deux
    const k = 0.5523 * 100
    const half = (t: number) => ({ x: 100 * Math.sin(t), y: 100 - 100 * Math.cos(t) })
    const a = { ...anchor(0, 0), ox: k / 2, oy: 0 }
    const c = { ...anchor(100, 100), ix: 0, iy: -k / 2 }
    const mid = half(Math.PI / 4)
    const m = { x: mid.x, y: mid.y, ix: -20, iy: 8, ox: 20, oy: -8 }
    const before = [a, m, c]
    const after = removeAnchorFit(before, false, 1)
    expect(after).toHaveLength(2)
    const curve = sampleCurve(after, false, 30)
    const far = Math.max(...curve.map((p) => Math.abs(Math.hypot(p.x - 0, p.y - 100) - 100)))
    expect(far).toBeLessThan(8)
  })
  it('retirer le bout d’un tracé ouvert enlève son segment, sans poignée au nouveau bout', () => {
    const out = removeAnchorFit([anchor(0, 0), dragHandle(anchor(50, 0), 10, 0), anchor(100, 0)], false, 2)
    expect(out).toHaveLength(2)
    expect(out[1].ox).toBe(0)
  })
  it('plusieurs points d’un coup', () => {
    expect(removeAnchorsFit([anchor(0, 0), anchor(1, 0), anchor(2, 0), anchor(3, 0)], false, new Set([1, 2]))).toHaveLength(2)
  })
})
