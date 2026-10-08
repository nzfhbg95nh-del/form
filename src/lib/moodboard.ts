// Logique « pure » de la toile du moodboard : positions, zoom, sélection, organisation, historique.
// Rien ici ne touche à l'écran : tout est testé automatiquement.

export type ItemKind = 'image' | 'note' | 'color' | 'link'

export interface BoardItem {
  id: string
  kind: ItemKind
  x: number
  y: number
  w: number
  h: number
  /** Les éléments qui ont le même groupe se sélectionnent et se déplacent ensemble. */
  group?: string | null
  flipX?: boolean
  flipY?: boolean
  /** image : identifiant de l'image enregistrée (table board_assets). */
  assetId?: string
  /** note : le texte. lien : le titre affiché. */
  text?: string
  /** note : couleur de fond. couleur : la couleur, en #rrggbb. */
  color?: string
  /** lien : l'adresse. */
  url?: string
}

export interface View {
  x: number
  y: number
  zoom: number
}

export interface Board {
  v: 1
  items: BoardItem[]
  view: View
  /** « theme » = la couleur de fond de l'application (claire ou sombre), sinon une couleur #rrggbb. */
  bg: string
  pattern: Pattern
}

export type Pattern = 'dots' | 'grid' | 'none'
export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'dots', label: 'Points' },
  { id: 'grid', label: 'Grille' },
  { id: 'none', label: 'Uni' },
]

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 16
/** Fond du moodboard : noir ou blanc (par défaut, celui du thème de l'application). */
export const BACKGROUNDS = ['#1f1f1f', '#ffffff']
export const NOTE_COLORS = ['#fff3a3', '#ffd6e0', '#cfeaff', '#d4f5d0', '#ffffff', 'transparent']

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3)

export function emptyBoard(): Board {
  return { v: 1, items: [], view: { x: 0, y: 0, zoom: 1 }, bg: 'theme', pattern: 'dots' }
}

export function parseBoard(content: string | null): Board {
  if (!content) return emptyBoard()
  try {
    const data = JSON.parse(content)
    if (data && data.v === 1 && Array.isArray(data.items)) return { ...emptyBoard(), ...data }
  } catch {
    /* plan illisible : on repart d'une toile vide */
  }
  return emptyBoard()
}

export const serializeBoard = (b: Board) => JSON.stringify(b)

// ───────────────────────── Géométrie ─────────────────────────

export function boundsOf(items: Pick<BoardItem, 'x' | 'y' | 'w' | 'h'>[]): Rect | null {
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

export function worldToScreen(view: View, p: { x: number; y: number }) {
  return { x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y }
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

export const rectsIntersect = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

export function itemsInRect(items: BoardItem[], rect: Rect): string[] {
  return items.filter((i) => rectsIntersect(i, rect)).map((i) => i.id)
}

/** Si un élément d'un groupe est sélectionné, tout le groupe l'est. */
export function expandGroups(items: BoardItem[], ids: Iterable<string>): Set<string> {
  const selected = new Set(ids)
  const groups = new Set(items.filter((i) => selected.has(i.id) && i.group).map((i) => i.group as string))
  for (const i of items) if (i.group && groups.has(i.group)) selected.add(i.id)
  return selected
}

/** Quel élément est sous ce point ? Celui du dessus (le dernier de la liste). */
export function hitTest(items: BoardItem[], p: { x: number; y: number }): BoardItem | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h) return it
  }
  return undefined
}

// ───────────────────────── Modifications ─────────────────────────

const map = (items: BoardItem[], ids: Set<string>, fn: (i: BoardItem) => BoardItem) => items.map((i) => (ids.has(i.id) ? fn(i) : i))

export function moveItems(items: BoardItem[], ids: Set<string>, dx: number, dy: number): BoardItem[] {
  return map(items, ids, (i) => ({ ...i, x: i.x + dx, y: i.y + dy }))
}

/** Agrandit / réduit des éléments autour d'un point fixe (le coin opposé à celui qu'on tire). */
export function scaleItems(items: BoardItem[], ids: Set<string>, anchor: { x: number; y: number }, fx: number, fy: number): BoardItem[] {
  return map(items, ids, (i) => ({
    ...i,
    x: anchor.x + (i.x - anchor.x) * fx,
    y: anchor.y + (i.y - anchor.y) * fy,
    w: Math.max(8, i.w * fx),
    h: Math.max(8, i.h * fy),
  }))
}

export function removeItems(items: BoardItem[], ids: Set<string>): BoardItem[] {
  return items.filter((i) => !ids.has(i.id))
}

export function duplicateItems(items: BoardItem[], ids: Set<string>, offset = 24): { items: BoardItem[]; newIds: Set<string> } {
  const groupMap = new Map<string, string>()
  const copies = items.filter((i) => ids.has(i.id)).map((i) => {
    let group = i.group
    if (group) {
      if (!groupMap.has(group)) groupMap.set(group, newId())
      group = groupMap.get(group)
    }
    return { ...i, id: newId(), x: i.x + offset, y: i.y + offset, group }
  })
  return { items: [...items, ...copies], newIds: new Set(copies.map((c) => c.id)) }
}

export function groupItems(items: BoardItem[], ids: Set<string>): BoardItem[] {
  const group = newId()
  return ids.size < 2 ? items : map(items, ids, (i) => ({ ...i, group }))
}

export function ungroupItems(items: BoardItem[], ids: Set<string>): BoardItem[] {
  return map(items, ids, (i) => ({ ...i, group: null }))
}

export function bringToFront(items: BoardItem[], ids: Set<string>): BoardItem[] {
  return [...items.filter((i) => !ids.has(i.id)), ...items.filter((i) => ids.has(i.id))]
}

export function sendToBack(items: BoardItem[], ids: Set<string>): BoardItem[] {
  return [...items.filter((i) => ids.has(i.id)), ...items.filter((i) => !ids.has(i.id))]
}

export function flipItems(items: BoardItem[], ids: Set<string>, axis: 'x' | 'y'): BoardItem[] {
  return map(items, ids, (i) => (axis === 'x' ? { ...i, flipX: !i.flipX } : { ...i, flipY: !i.flipY }))
}

// ───────────────────────── Organiser (comme PureRef) ─────────────────────────

/** Les éléments à organiser, dans l'ordre de lecture : de haut en bas, puis de gauche à droite. */
function inReadingOrder(items: BoardItem[], ids: Set<string>): BoardItem[] {
  const rowTolerance = 40
  return items
    .filter((i) => ids.has(i.id))
    .sort((a, b) => (Math.abs(a.y - b.y) < rowTolerance ? a.x - b.x : a.y - b.y))
}

function place(items: BoardItem[], positions: Map<string, { x: number; y: number }>): BoardItem[] {
  return items.map((i) => (positions.has(i.id) ? { ...i, ...positions.get(i.id)! } : i))
}

/** Range les éléments à la suite, en revenant à la ligne : une « mosaïque » à peu près carrée. */
export function arrangeFlow(items: BoardItem[], ids: Set<string>, gap = 16): BoardItem[] {
  const list = inReadingOrder(items, ids)
  const box = boundsOf(list)
  if (!box) return items
  const totalArea = list.reduce((s, i) => s + (i.w + gap) * (i.h + gap), 0)
  const maxWidth = Math.max(...list.map((i) => i.w), Math.sqrt(totalArea * 1.6))
  const positions = new Map<string, { x: number; y: number }>()
  let x = box.x
  let y = box.y
  let rowHeight = 0
  for (const i of list) {
    if (x > box.x && x + i.w > box.x + maxWidth) {
      x = box.x
      y += rowHeight + gap
      rowHeight = 0
    }
    positions.set(i.id, { x, y })
    x += i.w + gap
    rowHeight = Math.max(rowHeight, i.h)
  }
  return place(items, positions)
}

export function arrangeRow(items: BoardItem[], ids: Set<string>, gap = 16): BoardItem[] {
  const list = inReadingOrder(items, ids)
  const box = boundsOf(list)
  if (!box) return items
  const positions = new Map<string, { x: number; y: number }>()
  let x = box.x
  for (const i of list) {
    positions.set(i.id, { x, y: box.y })
    x += i.w + gap
  }
  return place(items, positions)
}

export function arrangeColumn(items: BoardItem[], ids: Set<string>, gap = 16): BoardItem[] {
  const list = inReadingOrder(items, ids)
  const box = boundsOf(list)
  if (!box) return items
  const positions = new Map<string, { x: number; y: number }>()
  let y = box.y
  for (const i of list) {
    positions.set(i.id, { x: box.x, y })
    y += i.h + gap
  }
  return place(items, positions)
}

/** Grille régulière : chaque élément est centré dans sa case. */
export function arrangeGrid(items: BoardItem[], ids: Set<string>, gap = 16): BoardItem[] {
  const list = inReadingOrder(items, ids)
  const box = boundsOf(list)
  if (!box) return items
  const cols = Math.ceil(Math.sqrt(list.length))
  const cellW = Math.max(...list.map((i) => i.w))
  const cellH = Math.max(...list.map((i) => i.h))
  const positions = new Map<string, { x: number; y: number }>()
  list.forEach((i, n) => {
    const col = n % cols
    const row = Math.floor(n / cols)
    positions.set(i.id, { x: box.x + col * (cellW + gap) + (cellW - i.w) / 2, y: box.y + row * (cellH + gap) + (cellH - i.h) / 2 })
  })
  return place(items, positions)
}

export type NormalizeMode = 'height' | 'width' | 'area'

/** Met les éléments à la même hauteur, largeur ou surface (moyenne), en gardant leurs proportions et leur centre. */
export function normalizeItems(items: BoardItem[], ids: Set<string>, mode: NormalizeMode): BoardItem[] {
  const list = items.filter((i) => ids.has(i.id))
  if (list.length < 2) return items
  const avg = (fn: (i: BoardItem) => number) => list.reduce((s, i) => s + fn(i), 0) / list.length
  const targetH = avg((i) => i.h)
  const targetW = avg((i) => i.w)
  const targetA = avg((i) => i.w * i.h)
  return map(items, ids, (i) => {
    const f = mode === 'height' ? targetH / i.h : mode === 'width' ? targetW / i.w : Math.sqrt(targetA / (i.w * i.h))
    const w = i.w * f
    const h = i.h * f
    return { ...i, x: i.x + (i.w - w) / 2, y: i.y + (i.h - h) / 2, w, h }
  })
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter'

export function alignItems(items: BoardItem[], ids: Set<string>, mode: AlignMode): BoardItem[] {
  const box = boundsOf(items.filter((i) => ids.has(i.id)))
  if (!box) return items
  return map(items, ids, (i) => {
    switch (mode) {
      case 'left': return { ...i, x: box.x }
      case 'right': return { ...i, x: box.x + box.w - i.w }
      case 'top': return { ...i, y: box.y }
      case 'bottom': return { ...i, y: box.y + box.h - i.h }
      case 'hcenter': return { ...i, x: box.x + (box.w - i.w) / 2 }
      case 'vcenter': return { ...i, y: box.y + (box.h - i.h) / 2 }
    }
  })
}

// ───────────────────────── Nouveaux éléments ─────────────────────────

/** Taille d'une image à l'import : elle tient dans un carré de `max` unités, proportions conservées. */
export function importSize(width: number, height: number, max = 420): { w: number; h: number } {
  const f = Math.min(1, max / Math.max(width, height))
  return { w: Math.max(16, width * f), h: Math.max(16, height * f) }
}

export function makeImage(assetId: string, width: number, height: number, at: { x: number; y: number }): BoardItem {
  const { w, h } = importSize(width, height)
  return { id: newId(), kind: 'image', assetId, x: at.x - w / 2, y: at.y - h / 2, w, h }
}

export const makeNote = (at: { x: number; y: number }, text = ''): BoardItem => ({
  id: newId(), kind: 'note', x: at.x, y: at.y, w: 220, h: 140, text, color: NOTE_COLORS[0],
})

export const makeSwatch = (at: { x: number; y: number }, color: string): BoardItem => ({
  id: newId(), kind: 'color', x: at.x, y: at.y, w: 120, h: 120, color,
})

export const makeLink = (at: { x: number; y: number }, url: string, title = ''): BoardItem => ({
  id: newId(), kind: 'link', x: at.x, y: at.y, w: 260, h: 64, url, text: title || url,
})

export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

// ───────────────────────── Historique (annuler / rétablir) ─────────────────────────

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export const newHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] })

export function commit<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (next === h.present) return h
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}
