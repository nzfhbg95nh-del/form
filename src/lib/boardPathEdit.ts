// Modifier un tracé de plume déjà posé (outil Sélection directe) : déplacer des points, tirer des poignées, tirer sur la courbe,
// ajouter ou retirer des points. Tout se calcule sur les points posés sur la toile (`worldPoints`), puis l'élément est refait (`rebuildPathItem`).

import { pathBounds, type PenPoint } from './boardPath'
import type { BoardItem } from './moodboard'

const rotateVec = (x: number, y: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) }
}

/** Les points d'un élément « plume » tels qu'ils sont posés sur la toile (taille du cadre, retournement et rotation compris). */
export function worldPoints(it: BoardItem): PenPoint[] {
  const w = it.w
  const h = it.h
  const cx = it.x + w / 2
  const cy = it.y + h / 2
  const fx = it.flipX ? -1 : 1
  const fy = it.flipY ? -1 : 1
  const rot = it.rot ?? 0
  return (it.path ?? []).map((p) => {
    const pos = rotateVec((p.x * w - w / 2) * fx, (p.y * h - h / 2) * fy, rot)
    const i = rotateVec(p.ix * w * fx, p.iy * h * fy, rot)
    const o = rotateVec(p.ox * w * fx, p.oy * h * fy, rot)
    return { x: cx + pos.x, y: cy + pos.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y }
  })
}

/** L'élément refait à partir de points posés sur la toile : même style, nouveau cadre (la rotation et le retournement sont « cuits » dans les points). */
export function rebuildPathItem(it: BoardItem, pts: PenPoint[], closed = !!it.closed): BoardItem {
  const box = pathBounds(pts, closed)
  const w = Math.max(1, box.w)
  const h = Math.max(1, box.h)
  const path = pts.map((p) => ({ x: (p.x - box.x) / w, y: (p.y - box.y) / h, ix: p.ix / w, iy: p.iy / h, ox: p.ox / w, oy: p.oy / h }))
  return { ...it, x: box.x, y: box.y, w, h, path, closed, rot: undefined, flipX: undefined, flipY: undefined }
}

/** Un point est « lisse » quand ses deux poignées existent et se prolongent (une droite). */
export function isSmooth(p: PenPoint): boolean {
  const li = Math.hypot(p.ix, p.iy)
  const lo = Math.hypot(p.ox, p.oy)
  if (li < 0.01 || lo < 0.01) return false
  const cross = Math.abs(p.ix * p.oy - p.iy * p.ox) / (li * lo)
  return cross < 0.03 && p.ix * p.ox + p.iy * p.oy < 0
}

/** Déplace des points d'ancrage (leurs poignées les suivent). */
export function moveAnchors(pts: PenPoint[], idxs: ReadonlySet<number>, dx: number, dy: number): PenPoint[] {
  return pts.map((p, i) => (idxs.has(i) ? { ...p, x: p.x + dx, y: p.y + dy } : p))
}

/** Tire une poignée jusqu'à (x, y). Sur un point lisse, l'autre poignée pivote pour rester dans le prolongement (Alt : elle ne bouge pas). */
export function moveHandle(pts: PenPoint[], index: number, which: 'in' | 'out', x: number, y: number, alt = false): PenPoint[] {
  return pts.map((p, i) => {
    if (i !== index) return p
    const smooth = !alt && isSmooth(p)
    const dx = x - p.x
    const dy = y - p.y
    const l = Math.hypot(dx, dy) || 1
    if (which === 'out') {
      const next = { ...p, ox: dx, oy: dy }
      if (!smooth) return next
      const len = Math.hypot(p.ix, p.iy)
      return { ...next, ix: (-dx / l) * len, iy: (-dy / l) * len }
    }
    const next = { ...p, ix: dx, iy: dy }
    if (!smooth) return next
    const len = Math.hypot(p.ox, p.oy)
    return { ...next, ox: (-dx / l) * len, oy: (-dy / l) * len }
  })
}

/** Sans poignées (point d'angle). */
export const toCorner = (p: PenPoint): PenPoint => ({ ...p, ix: 0, iy: 0, ox: 0, oy: 0 })

/** Le segment le plus proche d'un point : numéro du segment (de `seg` au suivant), position `t` sur la courbe, point le plus proche et distance. */
export function nearestOnPath(pts: PenPoint[], closed: boolean, at: { x: number; y: number }, steps = 40): { seg: number; t: number; x: number; y: number; dist: number } | null {
  const count = closed && pts.length > 1 ? pts.length : pts.length - 1
  let best: { seg: number; t: number; x: number; y: number; dist: number } | null = null
  for (let i = 0; i < count; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      const x = u * u * u * a.x + 3 * u * u * t * (a.x + a.ox) + 3 * u * t * t * (b.x + b.ix) + t * t * t * b.x
      const y = u * u * u * a.y + 3 * u * u * t * (a.y + a.oy) + 3 * u * t * t * (b.y + b.iy) + t * t * t * b.y
      const dist = Math.hypot(x - at.x, y - at.y)
      if (!best || dist < best.dist) best = { seg: i, t, x, y, dist }
    }
  }
  return best
}

const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Ajoute un point d'ancrage sur le segment `seg`, à la position `t`, sans changer la forme de la courbe. */
export function insertAnchor(pts: PenPoint[], closed: boolean, seg: number, t: number): { pts: PenPoint[]; index: number } {
  const a = pts[seg]
  const bi = (seg + 1) % pts.length
  const b = pts[bi]
  const p0 = { x: a.x, y: a.y }
  const p1 = { x: a.x + a.ox, y: a.y + a.oy }
  const p2 = { x: b.x + b.ix, y: b.y + b.iy }
  const p3 = { x: b.x, y: b.y }
  const q0 = lerp(p0, p1, t)
  const q1 = lerp(p1, p2, t)
  const q2 = lerp(p2, p3, t)
  const r0 = lerp(q0, q1, t)
  const r1 = lerp(q1, q2, t)
  const s = lerp(r0, r1, t)
  const added: PenPoint = { x: s.x, y: s.y, ix: r0.x - s.x, iy: r0.y - s.y, ox: r1.x - s.x, oy: r1.y - s.y }
  const out = pts.map((p) => ({ ...p }))
  out[seg] = { ...a, ox: q0.x - p0.x, oy: q0.y - p0.y }
  out[bi] = { ...b, ix: q2.x - p3.x, iy: q2.y - p3.y }
  const index = closed && bi === 0 ? pts.length : seg + 1
  out.splice(index, 0, added)
  return { pts: out, index }
}

/** Retire des points d'ancrage. */
export const removeAnchors = (pts: PenPoint[], idxs: ReadonlySet<number>): PenPoint[] => pts.filter((_, i) => !idxs.has(i))

/** Tire sur la courbe elle-même (entre le point `seg` et le suivant, à la position `t`) : les poignées des deux bouts suivent pour que la courbe passe par la souris. */
export function reshapeSegment(pts: PenPoint[], seg: number, t: number, dx: number, dy: number): PenPoint[] {
  const tt = Math.min(0.85, Math.max(0.15, t))
  const k = 1 / (3 * tt * (1 - tt))
  const bi = (seg + 1) % pts.length
  return pts.map((p, i) => {
    if (i === seg && i === bi) return p
    if (i === seg) return { ...p, ox: p.ox + dx * k, oy: p.oy + dy * k }
    if (i === bi) return { ...p, ix: p.ix + dx * k, iy: p.iy + dy * k }
    return p
  })
}

/** Garde la direction du point `to` vue depuis `from` sur un multiple de 45° (touche Maj). */
export function constrainAngle(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return to
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: from.x + len * Math.cos(a), y: from.y + len * Math.sin(a) }
}

/** Les bouts d'un tracé ouvert (premier et dernier point) : lequel est à moins de `radius` de `at`, ou -1. */
export function endpointAt(pts: PenPoint[], closed: boolean, at: { x: number; y: number }, radius: number): number {
  if (closed || pts.length < 2) return -1
  for (const i of [0, pts.length - 1]) if (Math.hypot(pts[i].x - at.x, pts[i].y - at.y) <= radius) return i
  return -1
}
