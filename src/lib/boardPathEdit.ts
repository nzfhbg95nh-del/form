// Passage entre un élément « tracé » du moodboard (points rangés en proportion de son cadre) et des points posés sur la toile,
// qui est la forme que le moteur de dessin (VectorCraft) comprend.

import { boundsOfSubs, normalizePoints, type PenPoint, type SubPath } from './boardPath'
import type { BoardItem } from './moodboard'

const rotateVec = (x: number, y: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) }
}

type Norm = { x: number; y: number; ix: number; iy: number; ox: number; oy: number }

/** Des points rangés en proportion du cadre de l'élément, posés sur la toile (taille du cadre, retournement et rotation compris). */
function toWorld(it: BoardItem, path: Norm[]): PenPoint[] {
  const w = it.w
  const h = it.h
  const cx = it.x + w / 2
  const cy = it.y + h / 2
  const fx = it.flipX ? -1 : 1
  const fy = it.flipY ? -1 : 1
  const rot = it.rot ?? 0
  return path.map((p) => {
    const pos = rotateVec((p.x * w - w / 2) * fx, (p.y * h - h / 2) * fy, rot)
    const i = rotateVec(p.ix * w * fx, p.iy * h * fy, rot)
    const o = rotateVec(p.ox * w * fx, p.oy * h * fy, rot)
    return { x: cx + pos.x, y: cy + pos.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y }
  })
}

/** Les points d'un élément « plume » tels qu'ils sont posés sur la toile. */
export const worldPoints = (it: BoardItem): PenPoint[] => toWorld(it, it.path ?? [])

/** Les autres morceaux de l'élément (trous), posés sur la toile. */
export const worldSubs = (it: BoardItem): SubPath[] => (it.sub ?? []).map((e) => ({ points: toWorld(it, e.path), closed: e.closed }))

/** L'élément refait à partir de points posés sur la toile : même style, nouveau cadre (la rotation et le retournement sont « cuits » dans les points). */
export function rebuildPathItem(it: BoardItem, pts: PenPoint[], closed = !!it.closed, extra: SubPath[] = []): BoardItem {
  const raw = boundsOfSubs([{ points: pts, closed }, ...extra])
  const box = { x: raw.x, y: raw.y, w: Math.max(1, raw.w), h: Math.max(1, raw.h) }
  const next: BoardItem = { ...it, x: box.x, y: box.y, w: box.w, h: box.h, path: normalizePoints(pts, box), closed, rot: undefined, flipX: undefined, flipY: undefined, sub: undefined }
  if (extra.length > 0) next.sub = extra.map((e) => ({ path: normalizePoints(e.points, box), closed: e.closed }))
  return next
}
