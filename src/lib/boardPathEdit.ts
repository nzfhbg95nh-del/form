// Passage entre un élément « tracé » du moodboard (points rangés en proportion de son cadre) et des points posés sur la toile,
// qui est la forme que le moteur de dessin (VectorCraft) comprend.

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
