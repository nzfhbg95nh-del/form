// Calculs de zoom et de cadrage de la Carte (la toile de la Carte et celle des moodboards se déplacent de la même façon).

export interface View {
  x: number
  y: number
  zoom: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 16

export function boundsOf(items: Pick<Rect, 'x' | 'y' | 'w' | 'h'>[]): Rect | null {
  if (items.length === 0) return null
  const x1 = Math.min(...items.map((i) => i.x))
  const y1 = Math.min(...items.map((i) => i.y))
  const x2 = Math.max(...items.map((i) => i.x + i.w))
  const y2 = Math.max(...items.map((i) => i.y + i.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export function screenToWorld(view: View, p: { x: number; y: number }) {
  return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom }
}

/** Zoom autour d'un point de l'écran : le point sous la souris ne bouge pas. */
export function zoomAt(view: View, factor: number, screen: { x: number; y: number }): View {
  const zoom = clampZoom(view.zoom * factor)
  const world = screenToWorld(view, screen)
  return { zoom, x: screen.x - world.x * zoom, y: screen.y - world.y * zoom }
}

/** Vue qui fait tenir un rectangle dans la fenêtre (avec une marge). */
export function fitView(rect: Rect | null, viewport: { w: number; h: number }, padding = 60, maxZoom = 1.5): View {
  if (!rect || rect.w <= 0 || rect.h <= 0) return { x: viewport.w / 2, y: viewport.h / 2, zoom: 1 }
  const zoom = clampZoom(Math.min((viewport.w - padding * 2) / rect.w, (viewport.h - padding * 2) / rect.h, maxZoom))
  return { zoom, x: (viewport.w - rect.w * zoom) / 2 - rect.x * zoom, y: (viewport.h - rect.h * zoom) / 2 - rect.y * zoom }
}
