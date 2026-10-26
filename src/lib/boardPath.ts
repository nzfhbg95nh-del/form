// La plume du moodboard : des tracés faits de points d'ancrage reliés par des courbes de Bézier, comme dans Illustrator.
// Un clic pose un point d'angle ; un clic suivi d'un glisser pose un point lisse (deux poignées opposées). Ici, la logique « pure ».

import { newId, type BoardItem, type Rect } from './moodboard'
import { styleToItem, type ShapeStyle } from './boardShapes'

/** Un point d'ancrage et ses deux poignées, données comme des écarts par rapport au point (`i` : poignée d'arrivée, `o` : poignée de départ). */
export interface PenPoint {
  x: number
  y: number
  ix: number
  iy: number
  ox: number
  oy: number
}

export const anchor = (x: number, y: number): PenPoint => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0 })

/** Tire la poignée de départ jusqu'à (x, y) ; l'autre poignée prend l'écart opposé (point lisse) sauf si `symmetric` est faux. */
export function dragHandle(p: PenPoint, x: number, y: number, symmetric = true): PenPoint {
  const dx = x - p.x
  const dy = y - p.y
  return symmetric ? { ...p, ox: dx, oy: dy, ix: -dx, iy: -dy } : { ...p, ox: dx, oy: dy }
}

const n = (v: number) => Math.round(v * 100) / 100

/** Le tracé SVG d'une suite de points ; `closed` : on revient au premier point. */
export function pathD(points: PenPoint[], closed: boolean): string {
  if (points.length === 0) return ''
  const seg = (a: PenPoint, b: PenPoint) => `C ${n(a.x + a.ox)} ${n(a.y + a.oy)} ${n(b.x + b.ix)} ${n(b.y + b.iy)} ${n(b.x)} ${n(b.y)}`
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`
  for (let i = 1; i < points.length; i++) d += ` ${seg(points[i - 1], points[i])}`
  if (closed && points.length > 1) d += ` ${seg(points[points.length - 1], points[0])} Z`
  return d
}

/** Des points le long de la courbe (pour mesurer son encombrement réel). */
export function sampleCurve(points: PenPoint[], closed: boolean, steps = 24): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const count = closed && points.length > 1 ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const p1 = { x: a.x + a.ox, y: a.y + a.oy }
    const p2 = { x: b.x + b.ix, y: b.y + b.iy }
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
      })
    }
  }
  if (points.length === 1) out.push({ x: points[0].x, y: points[0].y })
  return out
}

/** Le plus petit rectangle qui contient la courbe. */
export function pathBounds(points: PenPoint[], closed: boolean): Rect {
  const pts = sampleCurve(points, closed)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = n(Math.min(...xs))
  const y = n(Math.min(...ys))
  return { x, y, w: n(Math.max(...xs) - x), h: n(Math.max(...ys) - y) }
}

/** Retire les points posés deux fois au même endroit (un double-clic en pose deux). */
export function dedupePoints(points: PenPoint[], minDistance = 0.5): PenPoint[] {
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) >= minDistance)
}

/**
 * Le tracé terminé, sous forme d'élément du moodboard : un cadre (qui peut être déplacé, agrandi, tourné comme n'importe quelle forme)
 * et des points rangés en proportion du cadre (0 à 1), pour que l'agrandissement déforme le tracé avec lui.
 */
export function penToItem(points: PenPoint[], closed: boolean, style: ShapeStyle): BoardItem {
  const box = pathBounds(points, closed)
  const w = Math.max(1, box.w)
  const h = Math.max(1, box.h)
  const path = points.map((p) => ({ x: (p.x - box.x) / w, y: (p.y - box.y) / h, ix: p.ix / w, iy: p.iy / h, ox: p.ox / w, oy: p.oy / h }))
  return { id: newId(), kind: 'shape', x: box.x, y: box.y, w, h, ...styleToItem({ ...style, shape: 'path' }), path, closed }
}

/** Le tracé SVG d'un élément « plume », adapté à sa taille actuelle. */
export function itemPathD(it: BoardItem, w: number, h: number): string {
  const pts: PenPoint[] = (it.path ?? []).map((p) => ({ x: p.x * w, y: p.y * h, ix: p.ix * w, iy: p.iy * h, ox: p.ox * w, oy: p.oy * h }))
  return pathD(pts, !!it.closed)
}
