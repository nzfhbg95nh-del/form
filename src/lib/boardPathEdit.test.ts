import { describe, expect, it } from 'vitest'
import { penToItem, type PenPoint } from './boardPath'
import { rebuildPathItem, worldPoints } from './boardPathEdit'
import { DEFAULT_SHAPE_STYLE } from './boardShapes'

const pt = (x: number, y: number, extra: Partial<PenPoint> = {}): PenPoint => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0, ...extra })

describe('tracé du moodboard et points sur la toile', () => {
  it('le tracé reconstruit garde les mêmes points sur la toile (rotation comprise)', () => {
    const it = penToItem([pt(100, 100), pt(200, 100), pt(200, 150)], true, DEFAULT_SHAPE_STYLE)
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
  it('les poignées suivent le cadre quand on l’agrandit', () => {
    const it = penToItem([pt(0, 0, { ox: 10 }), pt(100, 50, { ix: -10 })], false, DEFAULT_SHAPE_STYLE)
    const wide = { ...it, w: it.w * 2 }
    expect(worldPoints(wide)[0].ox).toBeCloseTo(20)
  })
})
