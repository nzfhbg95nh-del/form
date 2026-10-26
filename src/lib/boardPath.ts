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

/** Un morceau d'un tracé : ses points et s'il se referme. */
export interface SubPath {
  points: PenPoint[]
  closed: boolean
}

/** Le plus petit rectangle qui contient tous les morceaux. */
export function boundsOfSubs(subs: SubPath[]): Rect {
  const boxes = subs.filter((p) => p.points.length > 0).map((p) => pathBounds(p.points, p.closed))
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: n(Math.max(...boxes.map((b) => b.x + b.w)) - x), h: n(Math.max(...boxes.map((b) => b.y + b.h)) - y) }
}

/** Les points rangés en proportion d'un cadre (0 à 1). */
export const normalizePoints = (points: PenPoint[], box: Rect): { x: number; y: number; ix: number; iy: number; ox: number; oy: number }[] =>
  points.map((p) => ({ x: (p.x - box.x) / box.w, y: (p.y - box.y) / box.h, ix: p.ix / box.w, iy: p.iy / box.h, ox: p.ox / box.w, oy: p.oy / box.h }))

/**
 * Le tracé terminé, sous forme d'élément du moodboard : un cadre (qui peut être déplacé, agrandi, tourné comme n'importe quelle forme)
 * et des points rangés en proportion du cadre (0 à 1), pour que l'agrandissement déforme le tracé avec lui. `extra` : les autres morceaux (trous).
 */
export function penToItem(points: PenPoint[], closed: boolean, style: ShapeStyle, extra: SubPath[] = []): BoardItem {
  const raw = boundsOfSubs([{ points, closed }, ...extra])
  const box = { x: raw.x, y: raw.y, w: Math.max(1, raw.w), h: Math.max(1, raw.h) }
  const item: BoardItem = { id: newId(), kind: 'shape', x: box.x, y: box.y, w: box.w, h: box.h, ...styleToItem({ ...style, shape: 'path' }), path: normalizePoints(points, box), closed }
  if (extra.length > 0) item.sub = extra.map((e) => ({ path: normalizePoints(e.points, box), closed: e.closed }))
  return item
}

/** Le tracé SVG d'un élément « plume » (tous ses morceaux), adapté à sa taille actuelle. */
export function itemPathD(it: BoardItem, w: number, h: number): string {
  const scale = (path: { x: number; y: number; ix: number; iy: number; ox: number; oy: number }[]): PenPoint[] =>
    path.map((p) => ({ x: p.x * w, y: p.y * h, ix: p.ix * w, iy: p.iy * h, ox: p.ox * w, oy: p.oy * h }))
  const parts = [pathD(scale(it.path ?? []), !!it.closed)]
  for (const e of it.sub ?? []) parts.push(pathD(scale(e.path), e.closed))
  return parts.filter(Boolean).join(' ')
}
