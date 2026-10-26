// Les outils de dessin à main levée et de retouche de tracés : Crayon (simplification puis courbes de Bézier), Lissage, Gomme de tracé et Raccordement.
// Ici, la logique « pure » : tout se calcule sur des points posés sur la toile (`PenPoint`).

import type { PenPoint } from './boardPath'
import { insertAnchor, nearestOnPath } from './boardPathEdit'

type P = { x: number; y: number }

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

/** Distance d'un point à un segment. */
function distToSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Douglas-Peucker : garde les points qui comptent et retire ceux qui s'écartent de moins de `tolerance` de la ligne. */
export function simplifyPolyline(pts: P[], tolerance: number): P[] {
  if (pts.length < 3) return pts
  const keep = new Array<boolean>(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number]
    let far = -1
    let farDist = tolerance
    for (let i = from + 1; i < to; i++) {
      const d = distToSegment(pts[i], pts[from], pts[to])
      if (d > farDist) {
        far = i
        farDist = d
      }
    }
    if (far >= 0) {
      keep[far] = true
      stack.push([from, far], [far, to])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const corner = (p: PenPoint): PenPoint => ({ ...p, ix: 0, iy: 0, ox: 0, oy: 0 })

/** Les poignées lisses d'un point, d'après ses deux voisins (Catmull-Rom). */
function smoothHandles(p: P, prev: P | null, next: P | null): Pick<PenPoint, 'ix' | 'iy' | 'ox' | 'oy'> {
  if (prev && next) {
    const tx = (next.x - prev.x) / 6
    const ty = (next.y - prev.y) / 6
    return { ix: -tx, iy: -ty, ox: tx, oy: ty }
  }
  if (next) return { ix: 0, iy: 0, ox: (next.x - p.x) / 3, oy: (next.y - p.y) / 3 }
  if (prev) return { ix: (prev.x - p.x) / 3, iy: (prev.y - p.y) / 3, ox: 0, oy: 0 }
  return { ix: 0, iy: 0, ox: 0, oy: 0 }
}

/** Transforme une ligne brisée en tracé lisse : des courbes partout, sauf aux angles plus vifs que `cornerDeg` (qui restent des pointes). */
export function fitSmooth(pts: P[], closed = false, cornerDeg = 70): PenPoint[] {
  const n = pts.length
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : closed && n > 2 ? pts[n - 1] : null
    const next = i < n - 1 ? pts[i + 1] : closed && n > 2 ? pts[0] : null
    const base: PenPoint = { x: p.x, y: p.y, ix: 0, iy: 0, ox: 0, oy: 0 }
    if (prev && next) {
      const a1 = Math.atan2(p.y - prev.y, p.x - prev.x)
      const a2 = Math.atan2(next.y - p.y, next.x - p.x)
      let turn = Math.abs(a2 - a1)
      if (turn > Math.PI) turn = 2 * Math.PI - turn
      if ((turn * 180) / Math.PI > cornerDeg) return base
    }
    // Les bouts d'un tracé ouvert n'ont pas de poignée (comme le Crayon d'Illustrator).
    if (!prev || !next) return base
    return { ...base, ...smoothHandles(p, prev, next) }
  })
}

/** Le tracé fait au Crayon : les points relevés à la souris sont simplifiés, puis lissés en courbes de Bézier. */
export function pencilToPath(raw: P[], tolerance: number): PenPoint[] {
  const distinct = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.01)
  return fitSmooth(simplifyPolyline(distinct, tolerance))
}

/** Outil Lissage : les points d'ancrage proches de `at` (à moins de `radius`) se rapprochent de la moyenne de leurs voisins, et leurs poignées sont refaites. */
export function smoothAround(pts: PenPoint[], closed: boolean, at: P, radius: number, strength = 0.5): PenPoint[] {
  const n = pts.length
  if (n < 3) return pts
  const near = pts.map((p) => dist(p, at) < radius)
  if (!near.some(Boolean)) return pts
  const moved = pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : null
    const next = i < n - 1 ? pts[i + 1] : closed ? pts[0] : null
    if (!near[i] || !prev || !next) return p
    const f = strength * (1 - dist(p, at) / radius * 0.5)
    return { ...p, x: p.x + ((prev.x + next.x) / 2 - p.x) * f, y: p.y + ((prev.y + next.y) / 2 - p.y) * f }
  })
  return moved.map((p, i) => {
    if (!near[i]) return p
    const prev = i > 0 ? moved[i - 1] : closed ? moved[n - 1] : null
    const next = i < n - 1 ? moved[i + 1] : closed ? moved[0] : null
    return { ...p, ...smoothHandles(p, prev, next) }
  })
}

/** Sans poignées d'un côté. */
const cutIn = (p: PenPoint): PenPoint => ({ ...p, ix: 0, iy: 0 })
const cutOut = (p: PenPoint): PenPoint => ({ ...p, ox: 0, oy: 0 })

/**
 * Outil Gomme de tracé : coupe le tracé là où la gomme (rayon `radius`) le touche. Renvoie les morceaux restants (un tracé fermé devient un seul tracé ouvert),
 * ou `null` si la gomme ne touche rien.
 */
export function eraseAt(pts: PenPoint[], closed: boolean, at: P, radius: number): PenPoint[][] | null {
  const near = nearestOnPath(pts, closed, at)
  if (!near || near.dist > radius) return null
  const { pts: cut, index } = insertAnchor(pts, closed, near.seg, near.t)
  let pieces: PenPoint[][]
  if (closed) {
    const rotated = [...cut.slice(index), ...cut.slice(0, index + 1)]
    pieces = [[cutIn(rotated[0]), ...rotated.slice(1, -1), cutOut(rotated[rotated.length - 1])]]
  } else {
    const a = cut.slice(0, index + 1)
    const b = cut.slice(index)
    pieces = [[...a.slice(0, -1), cutOut(a[a.length - 1])], [cutIn(b[0]), ...b.slice(1)]]
  }
  return pieces.filter((piece) => piece.length >= 2)
}

/** Le tracé parcouru à l'envers. */
export const reversePoints = (pts: PenPoint[]): PenPoint[] => [...pts].reverse().map((p) => ({ ...p, ix: p.ox, iy: p.oy, ox: p.ix, oy: p.iy }))

/**
 * Outil Raccordement : relie deux tracés ouverts par un bout. Si les deux bouts sont à moins de `mergeDist`, ils ne font plus qu'un point ;
 * sinon un segment droit les relie.
 */
export function joinEnds(a: PenPoint[], endA: 'start' | 'end', b: PenPoint[], endB: 'start' | 'end', mergeDist = 3): PenPoint[] {
  const first = endA === 'start' ? reversePoints(a) : a
  const second = endB === 'end' ? reversePoints(b) : b
  const last = first[first.length - 1]
  const head = second[0]
  if (dist(last, head) <= mergeDist) {
    const merged: PenPoint = { x: (last.x + head.x) / 2, y: (last.y + head.y) / 2, ix: last.ix, iy: last.iy, ox: head.ox, oy: head.oy }
    return [...first.slice(0, -1), merged, ...second.slice(1)]
  }
  return [...first, ...second]
}

/** Les bouts d'un tracé ouvert qui sont à moins de `radius` de `at` : numéro du point (0 ou dernier) et distance. */
export function endpointNear(pts: PenPoint[], closed: boolean, at: P, radius: number): { end: 'start' | 'end'; dist: number } | null {
  if (closed || pts.length < 2) return null
  const ds = dist(pts[0], at)
  const de = dist(pts[pts.length - 1], at)
  if (Math.min(ds, de) > radius) return null
  return ds <= de ? { end: 'start', dist: ds } : { end: 'end', dist: de }
}

/** Fait d'un point d'angle un point lisse (poignées d'après ses voisins), ou l'inverse. */
export function toggleSmooth(pts: PenPoint[], closed: boolean, index: number): PenPoint[] {
  const n = pts.length
  const p = pts[index]
  if (!p) return pts
  if (p.ix || p.iy || p.ox || p.oy) return pts.map((q, i) => (i === index ? corner(q) : q))
  const prev = index > 0 ? pts[index - 1] : closed ? pts[n - 1] : null
  const next = index < n - 1 ? pts[index + 1] : closed ? pts[0] : null
  return pts.map((q, i) => (i === index ? { ...q, ...smoothHandles(q, prev, next) } : q))
}
