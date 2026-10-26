import { describe, expect, it } from 'vitest'
import { anchor } from './boardPath'
import { endpointNear, eraseAt, fitSmooth, joinEnds, pencilToPath, reversePoints, simplifyPolyline, smoothAround, toggleSmooth } from './boardPathTools'

describe('crayon', () => {
  it('Douglas-Peucker retire les points alignés et garde les coins', () => {
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }))
    expect(simplifyPolyline(line, 1)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    const elbow = [...line, { x: 100, y: 10 }, { x: 100, y: 20 }, { x: 100, y: 30 }]
    const out = simplifyPolyline(elbow, 1)
    expect(out).toHaveLength(3)
    expect(out[1]).toEqual({ x: 100, y: 0 })
  })
  it('un tracé lissé a des poignées, sauf aux angles vifs', () => {
    const pts = fitSmooth([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }, { x: 100, y: 100 }])
    expect(pts[1].ox).not.toBe(0)
    expect(pts[1].ix).toBeCloseTo(-pts[1].ox)
    expect(pts[2].ox).toBe(0)
    expect(pts[2].ix).toBe(0)
    expect(pts[0].ix).toBe(0)
  })
  it('le crayon transforme beaucoup de points en peu de points d’ancrage', () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 9) * 40 }))
    const path = pencilToPath(raw, 2)
    expect(path.length).toBeLessThan(25)
    expect(path.length).toBeGreaterThan(2)
    expect(path[0].x).toBe(0)
    expect(path[path.length - 1].x).toBe(295)
  })
})

describe('lissage', () => {
  it('rapproche les points proches de la moyenne de leurs voisins, pas les autres', () => {
    const pts = [anchor(0, 0), anchor(50, 40), anchor(100, 0), anchor(150, 40), anchor(200, 0)]
    const out = smoothAround(pts, false, { x: 50, y: 40 }, 20, 1)
    expect(out[1].y).toBeLessThan(40)
    expect(out[3].y).toBe(40)
    expect(out[0]).toBe(pts[0])
  })
})

describe('gomme de tracé', () => {
  const line = () => [anchor(0, 0), anchor(100, 0), anchor(200, 0)]
  it('coupe un tracé ouvert en deux morceaux', () => {
    const out = eraseAt(line(), false, { x: 50, y: 2 }, 8)
    expect(out).toHaveLength(2)
    expect(out?.[0][out[0].length - 1].x).toBeCloseTo(50, 0)
    expect(out?.[1][0].x).toBeCloseTo(50, 0)
    expect(out?.[1][out[1].length - 1].x).toBe(200)
  })
  it('ne fait rien quand la gomme est loin', () => {
    expect(eraseAt(line(), false, { x: 50, y: 60 }, 8)).toBeNull()
  })
  it('un tracé fermé devient un tracé ouvert coupé à cet endroit', () => {
    const out = eraseAt([anchor(0, 0), anchor(100, 0), anchor(100, 100)], true, { x: 50, y: 0 }, 8)
    expect(out).toHaveLength(1)
    expect(out?.[0].length).toBe(5)
  })
})

describe('raccordement', () => {
  it('relie deux tracés par leurs bouts proches en un seul point', () => {
    const a = [anchor(0, 0), anchor(100, 0)]
    const b = [anchor(101, 1), anchor(200, 0)]
    const out = joinEnds(a, 'end', b, 'start')
    expect(out).toHaveLength(3)
    expect(out[1].x).toBeCloseTo(100.5)
  })
  it('relie par un segment quand les bouts sont éloignés, et retourne un tracé si besoin', () => {
    const a = [anchor(0, 0), anchor(100, 0)]
    const b = [anchor(300, 0), anchor(200, 0)]
    const out = joinEnds(a, 'end', b, 'end')
    expect(out.map((p) => p.x)).toEqual([0, 100, 200, 300])
    expect(reversePoints(a)[0].x).toBe(100)
  })
  it('trouve le bout d’un tracé ouvert près d’un point', () => {
    const pts = [anchor(0, 0), anchor(50, 0), anchor(100, 0)]
    expect(endpointNear(pts, false, { x: 98, y: 3 }, 10)?.end).toBe('end')
    expect(endpointNear(pts, false, { x: 50, y: 0 }, 10)).toBeNull()
    expect(endpointNear(pts, true, { x: 0, y: 0 }, 10)).toBeNull()
  })
})

describe('convertir un point', () => {
  it('un point d’angle devient lisse, et un point lisse devient un angle', () => {
    const pts = [anchor(0, 0), anchor(50, 30), anchor(100, 0)]
    const smooth = toggleSmooth(pts, false, 1)
    expect(smooth[1].ox).not.toBe(0)
    expect(toggleSmooth(smooth, false, 1)[1].ox).toBe(0)
  })
})
