// Calculs de la grille « masonry » (façon Pinterest). Rien ici ne touche à l'écran : tout est testé automatiquement.

export interface Placed {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_RATIO = 0.35
export const MAX_RATIO = 3

/** Largeur / hauteur d'un bloc, bornée pour qu'un panorama ou une bande très haute ne casse pas la grille. */
export const clampRatio = (r: number) => (!Number.isFinite(r) || r <= 0 ? 1 : Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)))

/** Nombre de colonnes pour une largeur visée de vignette. */
export const columnCount = (width: number, target: number, gap: number) => Math.max(1, Math.floor((width + gap) / (target + gap)))

/** Chaque bloc va dans la colonne la plus courte (à égalité, la plus à gauche) : l'ordre de lecture reste naturel. */
export function layoutMasonry(ratios: number[], width: number, target: number, gap: number): { items: Placed[]; height: number; columns: number } {
  const columns = columnCount(width, target, gap)
  const colW = (width - gap * (columns - 1)) / columns
  const heights = new Array<number>(columns).fill(0)
  const items = ratios.map((ratio) => {
    let col = 0
    for (let c = 1; c < columns; c++) if (heights[c] < heights[col]) col = c
    const h = colW / clampRatio(ratio)
    const placed = { x: col * (colW + gap), y: heights[col], w: colW, h }
    heights[col] += h + gap
    return placed
  })
  return { items, height: Math.max(0, ...heights) - (items.length > 0 ? gap : 0), columns }
}

/** Indices des vignettes à dessiner : celles qui touchent la zone visible, plus une marge. */
export function visibleIndices(items: Placed[], scrollTop: number, viewport: number, overscan: number): number[] {
  const from = scrollTop - overscan
  const to = scrollTop + viewport + overscan
  const out: number[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.y + it.h >= from && it.y <= to) out.push(i)
  }
  return out
}

/** 75 → « 1:15 ». */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
