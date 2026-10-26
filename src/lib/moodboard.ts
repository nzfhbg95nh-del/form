// Logique « pure » de la toile du moodboard : positions, zoom, sélection, organisation, historique.
// Rien ici ne touche à l'écran : tout est testé automatiquement.

export type ItemKind = 'image' | 'note' | 'color' | 'link' | 'text' | 'shape'

/** Les formes proposées dans le menu « Ajouter » : rectangle, rond et flèche (la flèche va d'un coin à l'autre du cadre ; « retourner » change la diagonale). Le type « line » n'est plus proposé mais reste lisible. */
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow'
export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Rond' },
  { id: 'arrow', label: 'Flèche' },
]

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
  /** texte : taille des lettres, police, gras, italique, alignement, interlignage (× taille), espacement des lettres (× taille). */
  size?: number
  font?: string
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right' | 'justify'
  lh?: number
  ls?: number
  /** texte, caractère : épaisseur (300 à 900), échelle horizontale et verticale (1 = 100 %), décalage de la ligne de base (pt), majuscules, exposant/indice, souligné, barré. */
  weight?: number
  sx?: number
  sy?: number
  base?: number
  caps?: 'none' | 'all' | 'small'
  script?: 'none' | 'sup' | 'sub'
  under?: boolean
  strike?: boolean
  /** texte, paragraphe (en points) : retrait gauche, droit, de première ligne ; espace avant et après ; coupure des mots ; liste. */
  indL?: number
  indR?: number
  indF?: number
  spB?: number
  spA?: number
  hyph?: boolean
  list?: 'none' | 'bullet' | 'number'
  /** Rotation, en degrés (sens des aiguilles d'une montre), autour du centre de l'élément. */
  rot?: number
  /** texte : `false` = zone de texte (largeur fixe, retour à la ligne automatique) ; sinon texte de point (s'agrandit en tapant). */
  auto?: boolean
  /** forme : laquelle. La couleur est dans `color` ; `filled` : remplie (sinon, seulement le contour) ; `sw` : épaisseur du trait. */
  shape?: ShapeKind
  filled?: boolean
  sw?: number
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

/** Fonds proposés : petits points (par défaut) ou uni. Un ancien moodboard qui avait la grille ou les cases repasse en petits points. */
export type Pattern = 'dots' | 'none'
export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'dots', label: 'Points' },
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
    if (data && data.v === 1 && Array.isArray(data.items)) {
      const board = { ...emptyBoard(), ...data }
      return board.pattern === 'none' ? board : { ...board, pattern: 'dots' }
    }
  } catch {
    /* plan illisible : on repart d'une toile vide */
  }
  return emptyBoard()
}

export const serializeBoard = (b: Board) => JSON.stringify(b)

// ───────────────────────── Géométrie ─────────────────────────

type Pt2 = { x: number; y: number }

/** Tourne un point autour d'un centre (en degrés, sens des aiguilles d'une montre à l'écran). */
export function rotatePoint(p: Pt2, c: Pt2, deg: number): Pt2 {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

export const centerOf = (i: Pick<BoardItem, 'x' | 'y' | 'w' | 'h'>): Pt2 => ({ x: i.x + i.w / 2, y: i.y + i.h / 2 })

/** Le plus petit rectangle droit qui contient l'élément, tourné ou non. */
export function itemBounds(i: Pick<BoardItem, 'x' | 'y' | 'w' | 'h' | 'rot'>): Rect {
  if (!i.rot) return { x: i.x, y: i.y, w: i.w, h: i.h }
  const c = centerOf(i)
  const pts = [{ x: i.x, y: i.y }, { x: i.x + i.w, y: i.y }, { x: i.x + i.w, y: i.y + i.h }, { x: i.x, y: i.y + i.h }].map((p) => rotatePoint(p, c, i.rot as number))
  const x1 = Math.min(...pts.map((p) => p.x))
  const y1 = Math.min(...pts.map((p) => p.y))
  return { x: x1, y: y1, w: Math.max(...pts.map((p) => p.x)) - x1, h: Math.max(...pts.map((p) => p.y)) - y1 }
}

export function boundsOf(items: Pick<BoardItem, 'x' | 'y' | 'w' | 'h' | 'rot'>[]): Rect | null {
  if (items.length === 0) return null
  const all = items.map(itemBounds)
  const x1 = Math.min(...all.map((i) => i.x))
  const y1 = Math.min(...all.map((i) => i.y))
  const x2 = Math.max(...all.map((i) => i.x + i.w))
  const y2 = Math.max(...all.map((i) => i.y + i.h))
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
  return items.filter((i) => rectsIntersect(itemBounds(i), rect)).map((i) => i.id)
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
    const q = it.rot ? rotatePoint(p, centerOf(it), -it.rot) : p
    if (q.x >= it.x && q.x <= it.x + it.w && q.y >= it.y && q.y <= it.y + it.h) return it
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

/**
 * Aligne les éléments sélectionnés (comme le panneau Aligner d'Illustrator). Par défaut sur le cadre de la sélection ;
 * `target` : sur un autre cadre (l'écran) ; `keyId` : sur un « objet clé », qui ne bouge pas. Les éléments tournés comptent par leur encombrement réel.
 */
export function alignItems(items: BoardItem[], ids: Set<string>, mode: AlignMode, opts: { target?: Rect | null; keyId?: string | null } = {}): BoardItem[] {
  const chosen = items.filter((i) => ids.has(i.id))
  const key = opts.keyId ? chosen.find((i) => i.id === opts.keyId) : undefined
  const box = key ? itemBounds(key) : opts.target ?? boundsOf(chosen)
  if (!box) return items
  return map(items, ids, (i) => {
    if (key && i.id === key.id) return i
    const b = itemBounds(i)
    switch (mode) {
      case 'left': return { ...i, x: i.x + box.x - b.x }
      case 'right': return { ...i, x: i.x + box.x + box.w - (b.x + b.w) }
      case 'top': return { ...i, y: i.y + box.y - b.y }
      case 'bottom': return { ...i, y: i.y + box.y + box.h - (b.y + b.h) }
      case 'hcenter': return { ...i, x: i.x + box.x + box.w / 2 - (b.x + b.w / 2) }
      case 'vcenter': return { ...i, y: i.y + box.y + box.h / 2 - (b.y + b.h / 2) }
    }
  })
}

/**
 * Répartir les objets : les bords (ou centres) choisis sont régulièrement espacés entre le premier et le dernier élément, qui ne bougent pas.
 * Il faut au moins trois éléments.
 */
export function distributeItems(items: BoardItem[], ids: Set<string>, mode: AlignMode): BoardItem[] {
  const horizontal = mode === 'left' || mode === 'hcenter' || mode === 'right'
  const anchor = (i: BoardItem) => {
    const b = itemBounds(i)
    if (horizontal) return mode === 'left' ? b.x : mode === 'right' ? b.x + b.w : b.x + b.w / 2
    return mode === 'top' ? b.y : mode === 'bottom' ? b.y + b.h : b.y + b.h / 2
  }
  const list = items.filter((i) => ids.has(i.id)).sort((a, b) => anchor(a) - anchor(b))
  if (list.length < 3) return items
  const first = anchor(list[0])
  const step = (anchor(list[list.length - 1]) - first) / (list.length - 1)
  const shifts = new Map(list.map((i, n) => [i.id, first + step * n - anchor(i)]))
  return items.map((i) => {
    const d = shifts.get(i.id)
    if (!d) return i
    return horizontal ? { ...i, x: i.x + d } : { ...i, y: i.y + d }
  })
}

/**
 * Répartir les espaces : les vides entre les éléments deviennent tous égaux (`gap` : valeur imposée, sinon on garde l'étendue du premier au dernier).
 * Avec un objet clé, il reste en place et les autres s'ajustent autour de lui.
 */
export function distributeSpacing(items: BoardItem[], ids: Set<string>, axis: 'x' | 'y', opts: { gap?: number | null; keyId?: string | null } = {}): BoardItem[] {
  const start = (i: BoardItem) => (axis === 'x' ? itemBounds(i).x : itemBounds(i).y)
  const len = (i: BoardItem) => (axis === 'x' ? itemBounds(i).w : itemBounds(i).h)
  const list = items.filter((i) => ids.has(i.id)).sort((a, b) => start(a) - start(b))
  if (list.length < 3 && opts.gap == null) return items
  if (list.length < 2) return items
  const last = list[list.length - 1]
  const total = start(last) + len(last) - start(list[0])
  const gap = opts.gap ?? (total - list.reduce((s, i) => s + len(i), 0)) / (list.length - 1)
  const target = new Map<string, number>()
  let at = start(list[0])
  for (const i of list) {
    target.set(i.id, at)
    at += len(i) + gap
  }
  // Avec un objet clé : tout est décalé pour que lui ne bouge pas.
  const key = opts.keyId ? list.find((i) => i.id === opts.keyId) : undefined
  const offset = key ? start(key) - (target.get(key.id) as number) : 0
  return items.map((i) => {
    const t = target.get(i.id)
    if (t === undefined) return i
    const d = t + offset - start(i)
    return axis === 'x' ? { ...i, x: i.x + d } : { ...i, y: i.y + d }
  })
}

// ───────────────────────── Poignées et ordre (comme Illustrator) ─────────────────────────

/** Les 8 poignées du cadre de sélection : 4 coins et 4 côtés. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const isCorner = (h: Handle) => h.length === 2

const axis = (h: Handle) => ({ hx: h.includes('w') ? -1 : h.includes('e') ? 1 : 0, hy: h.includes('n') ? -1 : h.includes('s') ? 1 : 0 })

/** Où se trouve une poignée sur le cadre. */
export function handlePoint(box: Rect, h: Handle): { x: number; y: number } {
  const { hx, hy } = axis(h)
  return { x: hx < 0 ? box.x : hx > 0 ? box.x + box.w : box.x + box.w / 2, y: hy < 0 ? box.y : hy > 0 ? box.y + box.h : box.y + box.h / 2 }
}

/**
 * Tirer une poignée : le point fixe et les facteurs d'agrandissement (horizontal et vertical). Un coin agrandit dans les deux sens, un côté dans un seul ;
 * `alt` : on agrandit depuis le centre ; `uniform` (Maj) : on garde les proportions. On ne retourne jamais l'élément (facteur d'au moins 0,05).
 */
export function resizeScale(box: Rect, h: Handle, world: { x: number; y: number }, opts: { alt?: boolean; uniform?: boolean } = {}): { anchor: { x: number; y: number }; fx: number; fy: number } {
  const { hx, hy } = axis(h)
  const grab = handlePoint(box, h)
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  const opposite = { x: hx < 0 ? box.x + box.w : hx > 0 ? box.x : center.x, y: hy < 0 ? box.y + box.h : hy > 0 ? box.y : center.y }
  const anchor = opts.alt ? center : opposite
  const sx = grab.x - anchor.x
  const sy = grab.y - anchor.y
  let fx = hx === 0 ? 1 : (world.x - anchor.x) / (sx || 1)
  let fy = hy === 0 ? 1 : (world.y - anchor.y) / (sy || 1)
  if (opts.uniform) {
    let f: number
    if (isCorner(h)) {
      const len = sx * sx + sy * sy
      f = len === 0 ? 1 : ((world.x - anchor.x) * sx + (world.y - anchor.y) * sy) / len
    } else f = hx !== 0 ? fx : fy
    fx = f
    fy = f
  }
  return { anchor, fx: Math.max(0.05, fx), fy: Math.max(0.05, fy) }
}

/** Avance d'un cran : chaque élément choisi passe devant celui qui le recouvrait (ceux déjà tout devant ne bougent pas). */
export function bringForward(items: BoardItem[], ids: Set<string>): BoardItem[] {
  const out = [...items]
  for (let i = out.length - 2; i >= 0; i--) {
    if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]
  }
  return out
}

/** Recule d'un cran : chaque élément choisi passe derrière celui qu'il recouvrait. */
export function sendBackward(items: BoardItem[], ids: Set<string>): BoardItem[] {
  const out = [...items]
  for (let i = 1; i < out.length; i++) {
    if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i - 1], out[i]] = [out[i], out[i - 1]]
  }
  return out
}

// ───────────────────────── Rotation et guides (comme Illustrator) ─────────────────────────

const normalizeDeg = (d: number) => Math.round((((d % 360) + 360) % 360) * 100) / 100

/** Arrondit un angle au pas donné (Maj pendant la rotation : de 15° en 15°). */
export const snapRotation = (deg: number, step = 15) => Math.round(deg / step) * step

/** Tourne des éléments de `delta` degrés autour d'un centre commun : chacun tourne sur lui-même et son centre fait le tour du centre commun. */
export function rotateItems(items: BoardItem[], ids: Set<string>, center: Pt2, delta: number): BoardItem[] {
  return items.map((it) => {
    if (!ids.has(it.id)) return it
    const c = rotatePoint(centerOf(it), center, delta)
    return { ...it, x: c.x - it.w / 2, y: c.y - it.h / 2, rot: normalizeDeg((it.rot ?? 0) + delta) }
  })
}

/**
 * Tirer une poignée d'un élément seul, même tourné : on travaille dans le repère de l'élément (là où il est droit), puis on remet le résultat à sa place.
 * Rend l'élément redimensionné et les facteurs d'agrandissement (pour agrandir aussi les lettres d'un texte).
 */
export function resizeRotated(item: BoardItem, h: Handle, world: Pt2, opts: { alt?: boolean; uniform?: boolean } = {}): { item: BoardItem; fx: number; fy: number } {
  const rot = item.rot ?? 0
  const c = centerOf(item)
  const local = rot ? rotatePoint(world, c, -rot) : world
  const box = { x: item.x, y: item.y, w: item.w, h: item.h }
  const { anchor, fx, fy } = resizeScale(box, h, local, opts)
  const w = Math.max(2, box.w * fx)
  const hh = Math.max(2, box.h * fy)
  const nx = anchor.x + (box.x - anchor.x) * fx
  const ny = anchor.y + (box.y - anchor.y) * fy
  const localCenter = { x: nx + w / 2, y: ny + hh / 2 }
  const wc = rot ? rotatePoint(localCenter, c, rot) : localCenter
  return { item: { ...item, x: wc.x - w / 2, y: wc.y - hh / 2, w, h: hh }, fx, fy }
}

/** Un trait d'alignement à montrer : vertical (`axis: 'x'`, à la position `pos`) ou horizontal (`axis: 'y'`), de `from` à `to`. */
export interface Guide {
  axis: 'x' | 'y'
  pos: number
  from: number
  to: number
}

const marks = (a: number, size: number) => [a, a + size / 2, a + size]

/**
 * Aimantation pendant un déplacement : si un bord ou le centre du rectangle déplacé est presque aligné avec un bord ou le centre d'un autre élément
 * (à moins de `threshold` unités), on corrige le déplacement (`dx`, `dy`) et on rend les traits d'alignement à dessiner.
 */
export function snapMove(moving: Rect, others: readonly Rect[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const best = (start: 'x' | 'y') => {
    const size = start === 'x' ? moving.w : moving.h
    const mine = marks(moving[start], size)
    let found: number | null = null
    for (const o of others) {
      for (const t of marks(o[start], start === 'x' ? o.w : o.h)) {
        for (const m of mine) {
          const diff = t - m
          if (Math.abs(diff) <= threshold && (found === null || Math.abs(diff) < Math.abs(found))) found = diff
        }
      }
    }
    return found ?? 0
  }
  const dx = best('x')
  const dy = best('y')
  const box = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h }
  const guides: Guide[] = []
  const seen = new Set<string>()
  for (const o of others) {
    for (const [axis, size] of [['x', 'w'], ['y', 'h']] as const) {
      const cross = axis === 'x' ? 'y' : 'x'
      const crossSize = axis === 'x' ? 'h' : 'w'
      for (const t of marks(o[axis], o[size])) {
        if (!marks(box[axis], box[size]).some((m) => Math.abs(m - t) < 0.5)) continue
        const key = `${axis}:${Math.round(t * 2)}`
        const from = Math.min(box[cross], o[cross])
        const to = Math.max(box[cross] + box[crossSize], o[cross] + o[crossSize])
        const existing = guides.find((g) => g.axis === axis && Math.abs(g.pos - t) < 0.5)
        if (existing) {
          existing.from = Math.min(existing.from, from)
          existing.to = Math.max(existing.to, to)
        } else if (!seen.has(key)) {
          seen.add(key)
          guides.push({ axis, pos: t, from, to })
        }
      }
    }
  }
  return { dx, dy, guides }
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

/**
 * Texte libre posé sur la toile (sans fond) ; sa couleur est celle du fond de la toile tant qu'on n'en choisit pas.
 * Par défaut un texte de point (un clic) ; avec `area`, une zone de texte de cette largeur (un glisser). La taille réelle de la boîte est refaite par `fitText`.
 */
export const makeText = (at: { x: number; y: number }, text = '', area: { w: number } | null = null): BoardItem => ({
  id: newId(), kind: 'text', x: at.x, y: at.y, w: area?.w ?? 40, h: 44, text, size: 32, auto: area === null,
})

export const SHAPE_COLOR = '#4da3ff'

export function makeShape(at: { x: number; y: number }, shape: ShapeKind): BoardItem {
  const linear = shape === 'line' || shape === 'arrow'
  const w = linear ? 240 : 200
  const h = linear ? 120 : 140
  return { id: newId(), kind: 'shape', shape, x: at.x - w / 2, y: at.y - h / 2, w, h, color: SHAPE_COLOR, filled: false, sw: 4 }
}

/** Les trois points de la pointe d'une flèche qui finit en (x2, y2) : une pointe de `size` unités, ouverte de 28° de chaque côté. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [number, number][] {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const spread = (28 * Math.PI) / 180
  return [
    [x2, y2],
    [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
    [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)],
  ]
}

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
