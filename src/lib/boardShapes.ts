// Les formes du moodboard, comme dans Illustrator : on les dessine en glissant, avec un remplissage et un contour réglables.
// Ici, la logique « pure » : les points d'un polygone ou d'une étoile, les tirets, le remplissage, et la création d'une forme à partir d'un glisser.

import { newId, SHAPE_COLOR, type BoardItem, type Rect, type ShapeKind } from './moodboard'

export type Dash = 'solid' | 'dashed' | 'dotted'
export const DASHES: { id: Dash; label: string }[] = [
  { id: 'solid', label: 'Plein' },
  { id: 'dashed', label: 'Tirets' },
  { id: 'dotted', label: 'Pointillés' },
]

/** Les réglages d'une forme (pour les formes qu'on dessine ensuite, comme dans Illustrator). */
export interface ShapeStyle {
  shape: ShapeKind
  color: string
  /** Remplissage : une couleur, ou « none ». */
  fill: string
  sw: number
  dash: Dash
  opacity: number
  radius: number
  sides: number
  points: number
  inner: number
}

export const DEFAULT_SHAPE_STYLE: ShapeStyle = { shape: 'rect', color: SHAPE_COLOR, fill: 'none', sw: 4, dash: 'solid', opacity: 1, radius: 24, sides: 6, points: 5, inner: 0.45 }

/** Les réglages d'une forme déjà posée (les anciennes formes n'ont que `filled`). */
export function shapeStyleOf(it: BoardItem): ShapeStyle {
  const d = DEFAULT_SHAPE_STYLE
  const color = it.color ?? d.color
  return {
    shape: it.shape ?? d.shape, color, fill: it.fill ?? (it.filled ? color : 'none'), sw: it.sw ?? d.sw, dash: it.dash ?? d.dash,
    opacity: it.opacity ?? d.opacity, radius: it.radius ?? d.radius, sides: it.sides ?? d.sides, points: it.points ?? d.points, inner: it.inner ?? d.inner,
  }
}

/** Les réglages qu'on recopie sur un élément (tout sauf `shape`, qui est traité à part pour les formes déjà posées). */
export const styleToItem = (st: ShapeStyle): Partial<BoardItem> => ({
  shape: st.shape, color: st.color, fill: st.fill, sw: st.sw, dash: st.dash, opacity: st.opacity, radius: st.radius, sides: st.sides, points: st.points, inner: st.inner,
})

const round = (v: number) => Math.round(v * 100) / 100

/** Les sommets d'un polygone régulier (ou ovale) inscrit dans le cadre, la pointe vers le haut ; `inset` : marge pour que le trait ne dépasse pas. */
export function polygonPoints(w: number, h: number, sides: number, inset = 0): [number, number][] {
  const n = Math.min(12, Math.max(3, Math.round(sides)))
  const rx = Math.max(1, w / 2 - inset)
  const ry = Math.max(1, h / 2 - inset)
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [round(w / 2 + rx * Math.cos(a)), round(h / 2 + ry * Math.sin(a))] as [number, number]
  })
}

/** Les sommets d'une étoile : `points` branches, `inner` = rayon du creux par rapport au rayon des pointes (0,1 à 0,9). */
export function starPoints(w: number, h: number, points: number, inner: number, inset = 0): [number, number][] {
  const n = Math.min(12, Math.max(3, Math.round(points)))
  const k = Math.min(0.9, Math.max(0.1, inner))
  const rx = Math.max(1, w / 2 - inset)
  const ry = Math.max(1, h / 2 - inset)
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (Math.PI * i) / n
    const f = i % 2 === 0 ? 1 : k
    return [round(w / 2 + rx * f * Math.cos(a)), round(h / 2 + ry * f * Math.sin(a))] as [number, number]
  })
}

export const pointsAttr = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ')

/** Le motif de tirets du trait (rien pour un trait plein ou sans épaisseur). */
export function dashArray(dash: Dash, sw: number): string | undefined {
  if (sw <= 0 || dash === 'solid') return undefined
  return dash === 'dashed' ? `${round(sw * 3)} ${round(sw * 2)}` : `0.01 ${round(sw * 2)}`
}

/** Le rayon des coins, limité à la moitié du plus petit côté. */
export const cornerRadius = (radius: number, w: number, h: number) => Math.max(0, Math.min(radius, Math.min(w, h) / 2))

const isLinear = (k: ShapeKind) => k === 'line' || k === 'arrow'

/** Une forme dessinée en glissant : `rect` est le cadre tiré à la souris (`square` : Maj, on garde un carré / un cercle). */
export function shapeFromDrag(rect: Rect, style: ShapeStyle, square = false): BoardItem {
  let { w, h } = rect
  let { x, y } = rect
  if (square && !isLinear(style.shape)) {
    const s = Math.max(w, h)
    // le coin opposé au point de départ reste en place : on étire vers le bas et la droite
    w = s
    h = s
  }
  return { id: newId(), kind: 'shape', x, y, w: Math.max(4, w), h: Math.max(4, h), ...styleToItem(style) }
}

/** Une forme à taille par défaut, centrée sur un point (un clic, ou le menu « Ajouter »). */
export function shapeAt(at: { x: number; y: number }, style: ShapeStyle): BoardItem {
  const linear = isLinear(style.shape)
  const round1 = style.shape === 'polygon' || style.shape === 'star'
  const w = linear ? 240 : round1 ? 170 : 200
  const h = linear ? 120 : round1 ? 170 : 140
  return { id: newId(), kind: 'shape', x: at.x - w / 2, y: at.y - h / 2, w, h, ...styleToItem(style) }
}

/** Change les réglages d'une forme ; la forme garde son cadre. */
export function restyleShape(it: BoardItem, patch: Partial<ShapeStyle>): BoardItem {
  if (it.kind !== 'shape') return it
  const next: Partial<BoardItem> = { ...patch }
  // une ancienne forme (avec `filled`) passe au remplissage libre
  if (patch.fill === undefined && it.fill === undefined && patch.color !== undefined && it.filled) next.fill = patch.color
  return { ...it, ...next, filled: undefined }
}
