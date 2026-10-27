import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignHorizontalDistributeEnd, AlignHorizontalDistributeStart, AlignHorizontalSpaceBetween, AlignJustify, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, AlignVerticalDistributeEnd, AlignVerticalDistributeStart, AlignVerticalSpaceBetween, Expand, ImagePlus, Italic, LayoutGrid, List, ListOrdered, Palette as PaletteIcon, PictureInPicture2, Pin, PinOff, Plus, Strikethrough, Underline, CircleHelp, ChevronDown, Type, ALargeSmall, Pilcrow } from 'lucide-react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { samplePixels, processImage } from '@/lib/images'
import {
  alignItems, arrangeColumn, distributeItems, distributeSpacing, arrowHead, bringForward, centerOf, handlePoint, HANDLES, isCorner, itemBounds, resizeRotated, resizeScale, rotateItems, sendBackward, snapMove, snapRotation, arrangeFlow, arrangeGrid, arrangeRow, BACKGROUNDS, boundsOf, bringToFront, commit, duplicateItems,
  expandGroups, fitView, flipItems, groupItems, itemsInRect, looksLikeUrl, makeImage, makeLink, makeNote, makeSwatch, makeText, moveItems,
  newHistory, newId, normalizeItems, normalizeRect, NOTE_COLORS, parseBoard, PATTERNS, redo, removeItems, scaleItems, screenToWorld, SHAPES,
  sendToBack, serializeBoard, undo, ungroupItems, worldToScreen, zoomAt,
  type AlignMode, type Board, type Guide, type Handle, type BoardItem, type NormalizeMode, type Pattern, type Rect, type ShapeKind, type View,
} from '@/lib/moodboard'
import { extractPalette, mergePalettes, readableOn } from '@/lib/palette'
import { closeFloatingBoard, floatingBoardId, openFloatingBoard } from '@/lib/floating'
import { isTauri } from '@/lib/repo'
import { itemPathD } from '@/lib/boardPath'
import { applyVcPaths, DEFAULT_PAINT, isEngineTool, isPathItem, itemToVcPath, VectorSession, type PaintStyle, type VcKind, type VcMods, type VcOut, type VcOverlay } from '@/lib/vectorEngine'
import { SHORTCUTS, VectorToolbar } from '@/components/VectorToolbar'
import { VectorOverlay, vectorCursor } from '@/components/VectorOverlay'
import { ToolOptionsPanel } from '@/components/ToolOptionsPanel'
import { FloatPanel } from '@/components/FloatPanel'
import { TOOL_HINTS } from '@/lib/vectorHints'
import { cornerRadius, dashArray, DEFAULT_SHAPE_STYLE, pointsAttr, polygonPoints, restyleShape, shapeAt, shapeStyleOf, starPoints } from '@/lib/boardShapes'
import { cssFont, FONTS, fitText, glyphSize, isPointText, layoutParas, lift, measureTextBox, paraStyleOf, scaleTexts, textStyleOf, TEXT_PAD, WEIGHTS, type Measure } from '@/lib/boardText'
import { withCoverAsset } from '@/biblio/lib/moodboardList.ts'
import { classifyLink, imageTypeOf, importMessage, IMPORT_LIMIT } from '@/lib/boardImport'
import { loadSaverSettings } from '@/biblio/lib/saver.ts'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'

interface Asset {
  thumb: string
  data: string
  w: number
  h: number
}

type Pt = { x: number; y: number }

type Drag =
  | { type: 'pan'; start: Pt; view: View }
  | { type: 'move'; start: Pt; ids: Set<string>; items: BoardItem[]; others: Rect[] }
  | { type: 'rotate'; center: Pt; start: number; base: number; ids: Set<string>; items: BoardItem[] }
  | { type: 'resize'; handle: Handle; box: Rect; uniform: boolean; ids: Set<string>; items: BoardItem[]; single?: BoardItem }
  | { type: 'marquee'; start: Pt; base: Set<string>; items: BoardItem[] }
  | { type: 'text'; start: Pt; end: Pt }
  | { type: 'engine' }

/** Couleurs proposées pour les formes et les textes. */
/** Le curseur de rotation (une flèche en arc), pour la zone juste à l'extérieur d'un coin du cadre de sélection. */
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 12a8 8 0 1 1-2.5-5.8'/%3E%3Cpath d='M20 3v5h-5'/%3E%3C/svg%3E") 12 12, crosshair`
type Tool = string
const bar = 'btn !px-2.5 !py-1 !text-xs !bg-[color-mix(in_srgb,var(--fg)_7%,var(--bg))] shadow-sm disabled:opacity-40'
// Barre du haut : des groupes arrondis (un fond commun) dont les boutons sont à plat ; l'état actif prend un fond clair avec relief.
const group = 'pointer-events-auto flex items-center gap-0.5 rounded-xl bg-[color-mix(in_srgb,var(--fg)_7%,var(--bg))] p-0.5 shadow-sm'
const item = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-[var(--fg)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_9%,transparent)] aria-pressed:bg-[var(--bg)] aria-pressed:text-[var(--accent)] aria-pressed:shadow-sm'

// Presse-papiers interne : copier / coller des éléments de la toile.
let internalClip: { stamp: string; items: BoardItem[] } | null = null

/** `compact` : version allégée pour le cadre d'une page (juste Images et Ajuster, sans barre du bas ni palette). */
/** Découpe l'aide d'un outil en une ligne par conseil (le texte original les sépare par « | »). */
function hintLines(segments: readonly (readonly [string, boolean])[]): React.ReactNode[][] {
  const lines: React.ReactNode[][] = [[]]
  segments.forEach(([text, bold], i) => {
    if (bold) { lines[lines.length - 1].push(<b key={`b${i}`} className="font-semibold text-[var(--fg)]">{text}</b>); return }
    text.split('|').forEach((part, n) => {
      if (n > 0) lines.push([])
      const t = n > 0 ? part.trimStart() : part
      if (t.trim() !== '') lines[lines.length - 1].push(<span key={`s${i}-${n}`}>{t}</span>)
    })
  })
  return lines.filter((l) => l.length > 0)
}

export function MoodboardView({ board, compact = false }: { board: ObjectRow; compact?: boolean }) {
  const initial = useMemo(() => parseBoard(board.content), [board.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const repo = useApp((s) => s.repo)
  const boardId = board.id

  const [hist, setHist] = useState(() => newHistory(initial.items))
  const [live, setLive] = useState<BoardItem[] | null>(null)
  const items = live ?? hist.present
  const [view, setView] = useState<View>(initial.view)
  const [bg, setBg] = useState(initial.bg)
  const [pattern, setPattern] = useState<Pattern>(initial.pattern)
  const appTheme = useApp((s) => s.theme)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; world: Pt; mode: 'full' | 'organize'; add?: boolean } | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [arrangeOpen, setArrangeOpen] = useState(false)
  // Moteur de dessin (VectorCraft) : sa conversation, ce qu'il demande de dessiner par-dessus, la forme du curseur, et les éléments tels qu'il les connaît.
  const vc = useRef<VectorSession>(new VectorSession())
  const [vcOverlays, setVcOverlays] = useState<VcOverlay[]>([])
  const [vcCursor, setVcCursor] = useState('default')
  // Le bout de la gomme / de la tache, et où est la souris sur la toile : le rond qui suit le curseur.
  const [vcTip, setVcTip] = useState<VcOut['tip']>(null)
  // Les réglages de l'outil de dessin actif (taille de la gomme et de la tache, fidélité du crayon).
  const [vcOptions, setVcOptions] = useState<VcOut['options']>(null)
  // Texte : une colonne d'icônes ; l'onglet ouvert (Caractère ou Paragraphe, ou aucun) est gardé d'une séance à l'autre.
  const [textTab, setTextTabState] = useState<'char' | 'para' | null>(() => {
    try { const v = localStorage.getItem('form-text-tab'); return v === 'char' || v === 'para' ? v : null } catch { return null }
  })
  const setTextTab = (v: 'char' | 'para' | null) => { setTextTabState(v); try { localStorage.setItem('form-text-tab', v ?? 'none') } catch { /* sans importance */ } }
  const stripBtn = (on: boolean) => 'flex h-9 w-9 items-center justify-center rounded-xl transition-colors ' + (on ? 'bg-[var(--bg)] text-[var(--accent)] shadow-[var(--shadow-soft)]' : 'text-[var(--fg)] hover:bg-[var(--bg-hover)]')
  const tabBtn = (on: boolean) => 'flex-1 rounded-lg px-2.5 py-1 text-center text-[11px] font-semibold transition-colors ' + (on ? 'bg-[var(--bg)] text-[var(--accent)] shadow-[var(--shadow-soft)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')
  // L'aide des outils (en bas à gauche) peut être réduite en un petit « ? » ; le choix est gardé.
  const [hintOpen, setHintOpen] = useState(() => { try { return localStorage.getItem('form-board-hint') !== 'closed' } catch { return true } })
  const toggleHint = (open: boolean) => { setHintOpen(open); try { localStorage.setItem('form-board-hint', open ? 'open' : 'closed') } catch { /* sans importance */ } }
  const [tipAt, setTipAt] = useState<[number, number] | null>(null)
  const vcItems = useRef<BoardItem[] | null>(null)
  // Panneau Aligner : ouvert ou non, « aligner sur » (la sélection, l'écran ou l'objet clé), et l'espace imposé entre les éléments (vide = égal).
  const [alignOpen, setAlignOpen] = useState(false)
  const [alignRef, setAlignRef] = useState<'selection' | 'screen' | 'key'>('selection')
  const [spaceInput, setSpaceInput] = useState('')
  const [palette, setPalette] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  // Outil actif : la flèche (sélection) ou le texte (touche T) ; et le texte en cours de frappe.
  const [tool, setTool] = useState<Tool>('select')
  // Remplissage et contour des prochains tracés (et des tracés choisis), comme le panneau de la barre d'outils d'Illustrator.
  const [paint, setPaint] = useState<PaintStyle>(DEFAULT_PAINT)
  const [draft, setDraft] = useState('')
  // Les traits d'alignement montrés pendant un déplacement (guides intelligents).
  const [guides, setGuides] = useState<Guide[]>([])
  // Où poser ce qu'on ajoute depuis le menu « Ajouter » (le point du clic droit), pour les fenêtres de choix qui s'ouvrent ensuite.
  const fileAt = useRef<Pt | null>(null)
  const linkAt = useRef<Pt | null>(null)
  const lastPt = useRef<Pt>({ x: 200, y: 200 })
  const [onTop, setOnTop] = useState(false)
  const isFloatingElsewhere = useApp((s) => s.floatingBoards.includes(board.id)) && !floatingBoardId()
  const [panning, setPanning] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selRef = useRef(selection)
  selRef.current = selection
  const paletteCache = useRef(new Map<string, string[]>())
  const dirty = useRef(false)
  const latest = useRef<Board>({ v: 1, items: hist.present, view, bg, pattern })
  latest.current = { v: 1, items: hist.present, view, bg, pattern }

  const say = useCallback((text: string) => {
    setFlash(text)
    window.setTimeout(() => setFlash(null), 2200)
  }, [])

  const commitItems = useCallback((next: BoardItem[]) => setHist((h) => commit(h, next)), [])
  const selected = useMemo(() => items.filter((i) => selection.has(i.id)), [items, selection])
  const selBox = useMemo(() => boundsOf(selected), [selected])
  // Le cadre de sélection : celui de l'élément (tourné avec lui) quand il est seul, sinon le rectangle qui contient toute la sélection.
  const frame = useMemo(() => {
    if (selected.length === 1) return { x: selected[0].x, y: selected[0].y, w: selected[0].w, h: selected[0].h, rot: selected[0].rot ?? 0 }
    return selBox ? { ...selBox, rot: 0 } : null
  }, [selected, selBox])

  // ── Taille de la zone, images enregistrées ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    el.focus()
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    void repo?.listBoardAssets(boardId).then((list) => {
      if (cancelled) return
      setAssets(Object.fromEntries(list.map((a) => [a.id, { thumb: a.thumb_url, data: a.data_url, w: a.width, h: a.height }])))
    })
    return () => { cancelled = true }
  }, [repo, boardId])

  // À la première ouverture d'une toile déjà remplie sans vue enregistrée : tout afficher.
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || size.w < 100) return
    fitted.current = true
    if (initial.items.length > 0 && initial.view.x === 0 && initial.view.y === 0 && initial.view.zoom === 1) {
      setView(fitView(boundsOf(initial.items), size))
    } else if (initial.items.length === 0) {
      setView({ x: size.w / 2, y: size.h / 2, zoom: 1 })
    }
  }, [size, initial])

  // ── Enregistrement automatique ──
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    dirty.current = true
    const t = window.setTimeout(() => {
      dirty.current = false
      void useApp.getState().update(boardId, { content: serializeBoard(latest.current) })
    }, 700)
    return () => window.clearTimeout(t)
  }, [hist.present, view, bg, pattern, boardId])
  useEffect(() => () => {
    if (dirty.current) void useApp.getState().update(boardId, { content: serializeBoard(latest.current) })
  }, [boardId])

  // ── Zoom à la molette ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-scroll]')) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      setView((v) => zoomAt(v, factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Importer des images, du texte, des liens ──
  const viewCenter = useCallback((): Pt => screenToWorld(viewRef.current, { x: size.w / 2, y: size.h / 2 }), [size])

  const addFiles = useCallback(async (files: File[], at: Pt) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    say(`Import de ${images.length} image${images.length > 1 ? 's' : ''}…`)
    const created: BoardItem[] = []
    const newAssets: Record<string, Asset> = {}
    for (const file of images) {
      try {
        const p = await processImage(file)
        const id = newId()
        await repo?.saveBoardAsset({ board_id: boardId, id, name: (file as File).name ?? 'image', width: p.width, height: p.height, data_url: p.dataUrl, thumb_url: p.thumbUrl, created_at: new Date().toISOString() })
        newAssets[id] = { thumb: p.thumbUrl, data: p.dataUrl, w: p.width, h: p.height }
        created.push(makeImage(id, p.width, p.height, at))
      } catch {
        say(`Impossible de lire « ${(file as File).name ?? 'image'} ».`)
      }
    }
    if (created.length === 0) return
    setAssets((a) => ({ ...a, ...newAssets }))
    const createdIds = new Set(created.map((c) => c.id))
    let next = [...itemsRef.current, ...created]
    if (created.length > 1) {
      next = arrangeFlow(next, createdIds)
      // On centre le lot sur le point de dépôt.
      const box = boundsOf(next.filter((i) => createdIds.has(i.id)))
      if (box) next = moveItems(next, createdIds, at.x - (box.x + box.w / 2), at.y - (box.y + box.h / 2))
    }
    commitItems(next)
    setSelection(createdIds)
    // Si le lot dépasse de l'écran, on recadre pour tout voir.
    const lot = boundsOf(next.filter((i) => createdIds.has(i.id)))
    const v = viewRef.current
    if (lot) {
      const tl = worldToScreen(v, { x: lot.x, y: lot.y })
      const br = worldToScreen(v, { x: lot.x + lot.w, y: lot.y + lot.h })
      if (tl.x < 0 || tl.y < 0 || br.x > size.w || br.y > size.h) setView(fitView(lot, size, 100))
    }
    say(created.length > 1 ? `${created.length} images ajoutées.` : 'Image ajoutée.')
  }, [repo, boardId, commitItems, say, size])

  const addNote = useCallback((at: Pt, text = '') => {
    const note = makeNote(at, text)
    commitItems([...itemsRef.current, note])
    setSelection(new Set([note.id]))
    if (!text) setEditing(note.id)
  }, [commitItems])

  // Largeur d'un texte à l'écran (même police que le dessin) : sert à ajuster la boîte d'un texte de point, et le retour à la ligne d'une zone de texte.
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null)
  const measureFor = useCallback((it: BoardItem): Measure => {
    if (!measureCtx.current) measureCtx.current = document.createElement('canvas').getContext('2d')
    const ctx = measureCtx.current
    const st = textStyleOf(it)
    return (text) => {
      if (!ctx) return text.length * st.size * 0.55
      ctx.font = cssFont(st)
      return ctx.measureText(text).width + st.ls * glyphSize(st) * text.length
    }
  }, [])
  const fit = useCallback((it: BoardItem) => fitText(it, measureFor(it)), [measureFor])

  /** Un texte de point à cet endroit (un clic) ou une zone de texte (un glisser), puis on tape tout de suite. */
  const addText = useCallback((at: Pt, area: { w: number } | null = null) => {
    const t = fit(makeText(at, '', area))
    commitItems([...itemsRef.current, t])
    setSelection(new Set([t.id]))
    setDraft('')
    setEditing(t.id)
  }, [commitItems, fit])

  /** Fin de la frappe : un texte resté vide disparaît ; sinon sa boîte est refaite à la bonne taille. */
  const finishText = (id: string, value: string) => {
    setEditing(null)
    if (!itemsRef.current.some((i) => i.id === id)) return
    if (value.trim() === '') {
      commitItems(itemsRef.current.filter((i) => i.id !== id))
      setSelection(new Set())
      return
    }
    commitItems(itemsRef.current.map((i) => (i.id === id ? fit({ ...i, text: value }) : i)))
  }

  /** Change le style (police, taille, gras…) des textes sélectionnés. */
  const setTextProps = (patch: Partial<BoardItem>) => {
    if (selRef.current.size === 0) return
    commitItems(itemsRef.current.map((it) => (selRef.current.has(it.id) && it.kind === 'text' ? fit({ ...it, ...patch }) : it)))
  }

  // ── Outils de dessin vectoriel (le moteur de VectorCraft) ──
  const engine = isEngineTool(tool) ? tool : null
  const presentRef = useRef(hist.present)
  presentRef.current = hist.present
  const modsOf = (e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): VcMods => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, space: spaceDown })
  const toolOfEngine = (id: string): Tool => (id === 'selection' ? 'select' : id === 'hand' ? 'hand' : id)

  // Les réglages d'un outil (taille de la gomme…) sont gardés d'une séance à l'autre : le moteur redémarre à chaque changement d'outil.
  const rememberOption = (toolId: string, key: string, value: number) => {
    try {
      const all = JSON.parse(localStorage.getItem('form-vc-options') ?? '{}') as Record<string, Record<string, number>>
      all[toolId] = { ...all[toolId], [key]: value }
      localStorage.setItem('form-vc-options', JSON.stringify(all))
    } catch { /* sans importance */ }
  }
  /** Charge le moteur avec les tracés du moodboard, puis lui remet les réglages gardés de l'outil (la taille de la gomme ne revient pas à l'ancienne valeur à chaque trait). */
  const vcLoad = (paths: ReturnType<typeof itemToVcPath>[], selected: string[], toolId: string, zoomNow: number, paintNow: typeof paint) => {
    const p = vc.current.load(paths, selected, toolId, zoomNow, paintNow)
    // Tout de suite après le chargement dans la file : le premier geste utilise déjà les bons réglages.
    restoreOptions(toolId)
    return p
  }
  const restoreOptions = (toolId: string) => {
    try {
      const saved = (JSON.parse(localStorage.getItem('form-vc-options') ?? '{}') as Record<string, Record<string, number>>)[toolId]
      if (!saved) return
      for (const [k, v] of Object.entries(saved)) void vc.current.option(k, v, viewRef.current.zoom).then((out) => vcApply(out, 'move'))
    } catch { /* sans importance */ }
  }

  /** Applique la réponse du moteur : les tracés (provisoirement pendant un geste, pour de bon à la fin), les dessins par-dessus, le curseur et la sélection. */
  const vcApply = (out: VcOut | null, kind: string) => {
    if (!out || !engine) return
    setVcOverlays(out.overlays)
    setVcCursor(out.cursor)
    setVcTip(out.tip)
    setVcOptions(out.options)
    const base = presentRef.current
    const next = applyVcPaths(kind === 'move' ? base : itemsRef.current, out.paths)
    const changed = next.length !== base.length || next.some((it, i) => it !== base[i])
    const final = kind === 'up' || kind === 'double' || kind === 'key'
    if (final) {
      setLive(null)
      if (changed) { vcItems.current = next; commitItems(next) }
    } else if (kind !== 'move') setLive(changed ? next : null)
    if (kind !== 'move') {
      selRef.current = new Set(out.selected)
      setSelection(new Set(out.selected))
    }
    if (out.status) say(out.status)
    if (out.switch_tool) setTool(toolOfEngine(out.switch_tool))
  }

  /** Envoie un geste au moteur (en le remettant d'abord à jour avec les tracés du moodboard si ceux-ci ont changé depuis, par exemple après Annuler). */
  const vcSend = (kind: VcKind, world: Pt, e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (!engine) return
    setTipAt([world.x, world.y])
    const s = vc.current
    const zoomNow = viewRef.current.zoom
    if (kind === 'down' && (!s.loaded || vcItems.current !== presentRef.current)) {
      vcItems.current = presentRef.current
      void vcLoad(presentRef.current.filter(isPathItem).map(itemToVcPath), [...selRef.current], engine, zoomNow, paint)
    }
    void s.pointer(kind, world.x, world.y, modsOf(e), zoomNow).then((out) => vcApply(out, kind))
  }

  // Un outil du moteur choisi : le moteur démarre avec les tracés du moodboard (ou change seulement d'outil s'il les connaît déjà) ; un autre outil : il s'arrête.
  useEffect(() => {
    const s = vc.current
    // Le rond de la gomme / de la tache d'un ancien outil ne doit pas rester le temps que le nouvel outil réponde.
    setVcTip(null)
    if (engine) {
      const present = presentRef.current
      if (s.loaded && vcItems.current === present) {
        void s.setTool(engine, viewRef.current.zoom).then((out) => { setVcOverlays(out.overlays); setVcCursor(out.cursor); setVcTip(out.tip); setVcOptions(out.options); restoreOptions(engine) })
      } else {
        vcItems.current = present
        void vcLoad(present.filter(isPathItem).map(itemToVcPath), [...selRef.current], engine, viewRef.current.zoom, paint).then((out) => {
          setVcOverlays(out.overlays)
          setVcCursor(out.cursor)
          setVcTip(out.tip)
          setVcOptions(out.options)
        })
      }
    } else if (s.loaded) {
      void s.close()
      setVcOverlays([])
    }
  }, [tool]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Remplissage et contour : on les change pour les formes et tracés choisis (tout de suite, même si le moteur n'est pas lancé : outil Sélection) et pour les prochains. */
  const changePaint = (next: PaintStyle) => {
    setPaint(next)
    const legacy = itemsRef.current.filter((i) => selRef.current.has(i.id) && i.kind === 'shape')
    if (legacy.length > 0) {
      const ids = new Set(legacy.map((i) => i.id))
      commitItems(itemsRef.current.map((it) => (ids.has(it.id) ? { ...it, fill: next.fill ?? 'none', color: next.stroke ?? it.color, sw: next.stroke ? next.sw : 0, filled: undefined } : it)))
    }
    if (vc.current.loaded) void vc.current.paint(next, viewRef.current.zoom).then((out) => vcApply(out, 'key'))
  }

  const addShape = useCallback((at: Pt, kind: ShapeKind) => {
    const sh = shapeAt(at, { ...DEFAULT_SHAPE_STYLE, shape: kind })
    commitItems([...itemsRef.current, sh])
    setSelection(new Set([sh.id]))
  }, [commitItems])

  /** Ajoute les images d'un tableau Pinterest, d'une épingle ou d'un post Instagram : elles sont téléchargées dans un dossier temporaire (pas dans la bibliothèque), posées sur la toile, puis le dossier est effacé. */
  const runImport = async (text: string, at: Pt) => {
    const { info, problem } = classifyLink(text)
    if (!info) { say(problem ?? 'Lien non pris en charge.'); return }
    if (!isTauri()) { say("L'import par lien n'existe que dans l'application Windows."); return }
    const saved = (await loadSaverSettings().catch(() => null))?.settings
    const cookies = info.site === 'instagram' ? saved?.igCookies : saved?.pinCookies
    if (info.site === 'instagram' && !cookies) { say("Pour Instagram, choisis d'abord ton fichier cookies dans Réglages > Bibliothèque (Télécharger mes enregistrements)."); return }
    setImporting(true)
    say('Téléchargement des images…')
    const off = await listen<{ count: number }>('linkimport-count', (e) => say(`${e.payload.count} image${e.payload.count > 1 ? 's' : ''} reçue${e.payload.count > 1 ? 's' : ''}…`))
    try {
      const { dir, files } = await invoke<{ dir: string; files: string[] }>('link_fetch', { url: info.url, cookies: cookies || null, limit: IMPORT_LIMIT })
      try {
        const images: File[] = []
        for (const path of files) {
          const type = imageTypeOf(path)
          if (!type) continue
          try {
            const blob = await (await fetch(convertFileSrc(path))).blob()
            images.push(new File([blob], path.split(/[\\/]/).pop() ?? 'image', { type }))
          } catch { /* fichier illisible : ignoré */ }
        }
        await addFiles(images, at)
        say(importMessage(images.length, files.length - images.length))
      } finally {
        await invoke('link_cleanup', { dir }).catch(() => undefined)
      }
    } catch (e) {
      say(String(e))
    } finally {
      off()
      setImporting(false)
    }
  }

  /** Un lien : celui d'un tableau Pinterest, d'une épingle ou d'un post Instagram télécharge ses images ; un autre lien devient une carte « lien ». */
  const addLink = (text: string, at: Pt) => {
    if (classifyLink(text).info) {
      void runImport(text, at)
      return
    }
    const l = makeLink({ x: at.x - 130, y: at.y - 32 }, text.trim())
    commitItems([...itemsRef.current, l])
    setSelection(new Set([l.id]))
  }
  const addLinkRef = useRef(addLink)
  addLinkRef.current = addLink

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement as HTMLElement | null
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && !containerRef.current?.contains(a)) return
      if (a?.tagName === 'TEXTAREA' && containerRef.current?.contains(a)) return
      const files = Array.from(e.clipboardData?.files ?? [])
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const center = viewCenter()
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        void addFiles(files, center)
      } else if (text.startsWith('form-board-items:') && internalClip && text === `form-board-items:${internalClip.stamp}`) {
        e.preventDefault()
        const { items: both, newIds } = duplicateItems(internalClip.items, new Set(internalClip.items.map((i) => i.id)), 30)
        commitItems([...itemsRef.current, ...both.filter((i) => newIds.has(i.id))])
        setSelection(newIds)
      } else if (looksLikeUrl(text)) {
        e.preventDefault()
        addLinkRef.current(text, center)
      } else if (text.trim()) {
        e.preventDefault()
        addNote({ x: center.x - 110, y: center.y - 70 }, text.trim())
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles, addNote, commitItems, viewCenter])

  // ── Palette de couleurs ──
  useEffect(() => {
    if (!paletteOpen) return
    let cancelled = false
    const imgs = (selected.length > 0 ? selected : items).filter((i) => i.kind === 'image' && i.assetId && assets[i.assetId])
    const t = window.setTimeout(async () => {
      const lists: string[][] = []
      for (const it of imgs.slice(0, 40)) {
        const id = it.assetId as string
        let colors = paletteCache.current.get(id)
        if (!colors) {
          try { colors = extractPalette(await samplePixels(assets[id].thumb), 6) } catch { colors = [] }
          paletteCache.current.set(id, colors)
        }
        lists.push(colors)
      }
      if (!cancelled) setPalette(mergePalettes(lists, 10))
    }, 250)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [paletteOpen, selected, items, assets])

  // ── Pointeur : déplacer, redimensionner, sélectionner, naviguer ──
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = containerRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-ui]')) return
    if (target.tagName === 'TEXTAREA') return
    containerRef.current?.focus()
    setMenu(null)
    const pt = local(e)
    const v = viewRef.current

    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand'))) {
      e.preventDefault()
      dragRef.current = { type: 'pan', start: pt, view: v }
      setPanning(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return

    const world = screenToWorld(v, pt)
    const cur = itemsRef.current
    const rotateAt = target.dataset.rotate
    if (rotateAt && selBox) {
      const picked = cur.filter((i) => selRef.current.has(i.id))
      const one = picked.length === 1 ? picked[0] : null
      const center = one ? centerOf(one) : { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 }
      dragRef.current = { type: 'rotate', center, start: Math.atan2(world.y - center.y, world.x - center.x), base: one?.rot ?? 0, ids: new Set(selRef.current), items: cur }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    const handle = target.dataset.handle as Handle | undefined
    if (handle && selBox) {
      const single = cur.filter((i) => selRef.current.has(i.id))
      // Un texte de point grandit toujours avec ses lettres (proportions gardées) ; Maj garde les proportions des autres.
      const uniform = single.length === 1 && isPointText(single[0])
      dragRef.current = { type: 'resize', handle, box: selBox, uniform, ids: new Set(selRef.current), items: cur, single: single.length === 1 ? single[0] : undefined }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (engine) {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { type: 'engine' }
      vcSend('down', world, e)
      return
    }

    if (tool === 'text') {
      const hit = target.closest('[data-item]') as HTMLElement | null
      const onText = hit ? cur.find((i) => i.id === hit.dataset.item && i.kind === 'text') : undefined
      if (onText) {
        setSelection(new Set([onText.id]))
        setDraft(onText.text ?? '')
        setEditing(onText.id)
        return
      }
      setSelection(new Set())
      dragRef.current = { type: 'text', start: world, end: world }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    const el = target.closest('[data-item]') as HTMLElement | null
    if (el) {
      const id = el.dataset.item as string
      let sel = selRef.current
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const group = expandGroups(cur, [id])
        sel = new Set(sel)
        const all = [...group].every((g) => sel.has(g))
        for (const g of group) all ? sel.delete(g) : sel.add(g)
      } else if (!sel.has(id)) {
        sel = expandGroups(cur, [id])
      }
      setSelection(sel)
      if (sel.has(id)) {
        let from = cur
        let moving = sel
        // Alt + glisser : on déplace une copie (comme dans Illustrator).
        if (e.altKey) {
          const copy = duplicateItems(cur, sel, 0)
          commitItems(copy.items)
          from = copy.items
          moving = copy.newIds
          setSelection(copy.newIds)
        }
        dragRef.current = { type: 'move', start: world, ids: moving, items: from, others: from.filter((i) => !moving.has(i.id)).map(itemBounds) }
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      return
    }

    const base = e.shiftKey ? new Set(selRef.current) : new Set<string>()
    if (!e.shiftKey) setSelection(new Set())
    setEditing(null)
    dragRef.current = { type: 'marquee', start: world, base, items: cur }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    lastPt.current = local(e)
    const d = dragRef.current
    if (engine) { vcSend(d ? 'drag' : 'move', screenToWorld(viewRef.current, local(e)), e); return }
    if (!d) return
    const pt = local(e)
    const v = viewRef.current
    const world = screenToWorld(v, pt)
    if (d.type === 'pan') {
      setView({ ...d.view, x: d.view.x + pt.x - d.start.x, y: d.view.y + pt.y - d.start.y })
    } else if (d.type === 'move') {
      let dx = world.x - d.start.x
      let dy = world.y - d.start.y
      // Maj : le déplacement reste horizontal ou vertical.
      let locked: 'dx' | 'dy' | null = null
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { dy = 0; locked = 'dy' } else { dx = 0; locked = 'dx' } }
      const started = !!live || Math.hypot(dx, dy) * v.zoom > 3
      // Guides intelligents : un bord ou le centre qui s'aligne sur un autre élément s'y colle (Ctrl pour désactiver).
      let shown: Guide[] = []
      if (started && !(e.ctrlKey || e.metaKey) && d.others.length > 0) {
        const mb = boundsOf(d.items.filter((i) => d.ids.has(i.id)))
        if (mb) {
          const sn = snapMove({ ...mb, x: mb.x + dx, y: mb.y + dy }, d.others, 6 / v.zoom)
          if (locked !== 'dx') dx += sn.dx
          if (locked !== 'dy') dy += sn.dy
          shown = sn.guides
        }
      }
      setGuides(shown)
      if (started) setLive(moveItems(d.items, d.ids, dx, dy))
    } else if (d.type === 'resize') {
      const opts = { alt: e.altKey, uniform: d.uniform || e.shiftKey }
      if (d.single) {
        const r = resizeRotated(d.single, d.handle, world, opts)
        setLive(scaleTexts(d.items.map((i) => (i.id === r.item.id ? r.item : i)), d.items, d.ids, r.fx, r.fy))
      } else {
        const { anchor, fx, fy } = resizeScale(d.box, d.handle, world, opts)
        setLive(scaleTexts(scaleItems(d.items, d.ids, anchor, fx, fy), d.items, d.ids, fx, fy))
      }
    } else if (d.type === 'rotate') {
      // Tirer autour du centre : l'angle suit la souris ; Maj arrondit de 15° en 15°.
      let delta = ((Math.atan2(world.y - d.center.y, world.x - d.center.x) - d.start) * 180) / Math.PI
      if (e.shiftKey) delta = snapRotation(d.base + delta) - d.base
      setLive(rotateItems(d.items, d.ids, d.center, delta))
      setFlash(`${Math.round((((d.base + delta) % 360) + 360) % 360)}°`)
    } else if (d.type === 'text') {
      d.end = world
      setMarquee(normalizeRect(worldToScreen(v, d.start), pt))
    } else if (d.type === 'marquee') {
      const rect = normalizeRect(d.start, world)
      const hit = expandGroups(d.items, itemsInRect(d.items, rect))
      setSelection(new Set([...d.base, ...hit]))
      setMarquee(normalizeRect(worldToScreen(v, d.start), pt))
    }
  }

  const endDrag = (e?: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    if (d.type === 'text') {
      const rect = normalizeRect(d.start, d.end)
      const zoomNow = viewRef.current.zoom
      if (rect.w * zoomNow > 6 || rect.h * zoomNow > 6) addText({ x: rect.x, y: rect.y }, { w: Math.max(40, rect.w) })
      else addText(d.start)
    }
    if (d.type === 'engine' && e) vcSend('up', screenToWorld(viewRef.current, local(e)), e)
    if ((d.type === 'move' || d.type === 'resize' || d.type === 'rotate') && live) commitItems(d.type === 'resize' ? live.map((i) => (d.ids.has(i.id) ? fit(i) : i)) : live)
    if (d.type === 'rotate') setFlash(null)
    setGuides([])
    setLive(null)
    setMarquee(null)
    setPanning(false)
    dragRef.current = null
    if (e) { try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ } }
  }

  const fitTo = useCallback((list: BoardItem[]) => setView(fitView(boundsOf(list), size, 80)), [size])

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-ui]') || target.tagName === 'TEXTAREA') return
    if (engine) { vcSend('double', screenToWorld(viewRef.current, local(e)), e); return }
    const world = screenToWorld(viewRef.current, local(e))
    const el = target.closest('[data-item]') as HTMLElement | null
    if (!el) { addNote({ x: world.x - 110, y: world.y - 70 }); return }
    const it = itemsRef.current.find((i) => i.id === el.dataset.item)
    if (!it) return
    if (it.kind === 'text') { setDraft(it.text ?? ''); setEditing(it.id) }
    else if (it.kind === 'note') setEditing(it.id)
    else if (it.kind === 'link' && it.url) {
      void (isTauri() ? import('@tauri-apps/plugin-opener').then((m) => m.openUrl(it.url as string)) : Promise.resolve(window.open(it.url, '_blank')))
    } else if (it.kind === 'color' && it.color) {
      void navigator.clipboard.writeText(it.color).then(() => say(`Couleur copiée : ${it.color}`))
    } else fitTo([it])
  }

  // ── Actions sur la sélection ──
  const withSelection = (fn: (items: BoardItem[], ids: Set<string>) => BoardItem[]) => {
    if (selRef.current.size === 0) return
    commitItems(fn(itemsRef.current, new Set(selRef.current)))
  }
  const act = {
    remove: () => { withSelection(removeItems); setSelection(new Set()) },
    duplicate: () => {
      if (selRef.current.size === 0) return
      const { items: out, newIds } = duplicateItems(itemsRef.current, new Set(selRef.current))
      commitItems(out)
      setSelection(newIds)
    },
    group: () => withSelection(groupItems),
    ungroup: () => withSelection(ungroupItems),
    front: () => withSelection(bringToFront),
    back: () => withSelection(sendToBack),
    forward: () => withSelection(bringForward),
    backward: () => withSelection(sendBackward),
    flip: (axis: 'x' | 'y') => withSelection((i, s) => flipItems(i, s, axis)),
    flow: () => withSelection((i, s) => arrangeFlow(i, s)),
    row: () => withSelection((i, s) => arrangeRow(i, s)),
    column: () => withSelection((i, s) => arrangeColumn(i, s)),
    grid: () => withSelection((i, s) => arrangeGrid(i, s)),
    normalize: (m: NormalizeMode) => withSelection((i, s) => normalizeItems(i, s, m)),
    align: (m: AlignMode) => withSelection((i, s) => alignItems(i, s, m)),
    // Panneau Aligner : l'objet clé est le dernier élément sélectionné (Maj+clic) ; « écran » = la partie visible de la toile.
    alignOn: (m: AlignMode) => withSelection((i, s) => {
      const keyId = alignRef === 'key' ? [...selRef.current].pop() ?? null : null
      const v = viewRef.current
      const target = alignRef === 'screen' ? { x: -v.x / v.zoom, y: -v.y / v.zoom, w: size.w / v.zoom, h: size.h / v.zoom } : null
      return alignItems(i, s, m, { target, keyId })
    }),
    distribute: (m: AlignMode) => withSelection((i, s) => distributeItems(i, s, m)),
    space: (axis: 'x' | 'y') => withSelection((i, s) => {
      const gap = spaceInput.trim() === '' ? null : Number(spaceInput)
      const keyId = alignRef === 'key' ? [...selRef.current].pop() ?? null : null
      return distributeSpacing(i, s, axis, { gap: gap !== null && Number.isFinite(gap) ? gap : null, keyId })
    }),
    noteColor: (color: string) => withSelection((i, s) => i.map((it) => (s.has(it.id) && it.kind === 'note' ? { ...it, color } : it))),
    shapeColor: (color: string) => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && (it.kind === 'shape' || it.kind === 'text') ? { ...it, color } : it))),
    shapeFill: (fill: string) => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && it.kind === 'shape' ? restyleShape(it, { fill }) : it))),
    toggleFill: () => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && it.kind === 'shape' ? restyleShape(it, { fill: shapeStyleOf(it).fill === 'none' ? shapeStyleOf(it).color : 'none' }) : it))),
    stroke: (d: number) => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && it.kind === 'shape' ? { ...it, sw: Math.min(40, Math.max(1, (it.sw ?? 4) + d)) } : it))),
    fontSize: (f: number) => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && it.kind === 'text' ? { ...it, size: Math.min(400, Math.max(8, Math.round((it.size ?? 32) * f))) } : it))),
    selectAll: () => setSelection(new Set(itemsRef.current.map((i) => i.id))),
  }
  const doUndo = () => { setHist((h) => undo(h)); setSelection(new Set()) }
  const doRedo = () => { setHist((h) => redo(h)); setSelection(new Set()) }

  const copySelection = () => {
    const list = itemsRef.current.filter((i) => selRef.current.has(i.id))
    if (list.length === 0) return
    internalClip = { stamp: String(Date.now()), items: list }
    void navigator.clipboard.writeText(`form-board-items:${internalClip.stamp}`)
    say(`${list.length} élément${list.length > 1 ? 's' : ''} copié${list.length > 1 ? 's' : ''}`)
  }

  /** Alt, Ctrl ou Maj pressés ou relâchés sans bouger la souris : le moteur reçoit un déplacement sur place pour que le curseur et les repères changent tout de suite. */
  const modifierChanged = (e: React.KeyboardEvent) => {
    if (!engine || !['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return
    if (e.key === 'Alt') e.preventDefault() // sinon Windows donne le focus à la barre de menus au relâchement de Alt
    vcSend(dragRef.current ? 'drag' : 'move', screenToWorld(viewRef.current, lastPt.current), e)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    modifierChanged(e)
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
      if (e.key === 'Escape') (e.target as HTMLElement).blur()
      return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    let handled = true
    // Suppr / Retour arrière avec seulement des images, textes… choisis (aucun tracé) : on les retire comme d'habitude, sans passer par le moteur.
    const deleting = e.key === 'Delete' || e.key === 'Backspace'
    const pathSelected = itemsRef.current.some((i) => selRef.current.has(i.id) && isPathItem(i))
    const plainDelete = deleting && selRef.current.size > 0 && !pathSelected
    if (engine && !plainDelete && ['Enter', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      // Le moteur doit connaître les tracés actuels du moodboard avant de recevoir la touche (sinon un état ancien pourrait effacer des tracés).
      if (!vc.current.loaded || vcItems.current !== presentRef.current) {
        vcItems.current = presentRef.current
        void vcLoad(presentRef.current.filter(isPathItem).map(itemToVcPath), [...selRef.current], engine, viewRef.current.zoom, paint)
      }
      // Ces touches sont celles du moteur (Entrée et Échap terminent un tracé, Suppr retire les points choisis, les flèches les déplacent).
      // Les images, textes… choisis en même temps ne sont pas connus du moteur : Suppr les retire aussi.
      const others = e.key === 'Delete' || e.key === 'Backspace' ? itemsRef.current.filter((i) => selRef.current.has(i.id) && !isPathItem(i)).map((i) => i.id) : []
      void vc.current.key(e.key, modsOf(e), viewRef.current.zoom).then((out) => {
        vcApply(out, 'key')
        if (others.length > 0) { const gone = new Set(others); commitItems(itemsRef.current.filter((i) => !gone.has(i.id))); setSelection(new Set()) }
      })
    } else if (e.key === ' ') setSpaceDown(true)
    else if (e.key === 'Delete' || e.key === 'Backspace') act.remove()
    else if (!mod && e.shiftKey && key === 'a') setMenu({ x: lastPt.current.x, y: lastPt.current.y, world: screenToWorld(viewRef.current, lastPt.current), mode: 'full', add: true })
    else if (mod && key === 'a') act.selectAll()
    else if (mod && key === 'd') act.duplicate()
    else if (mod && key === 'g') (e.shiftKey ? act.ungroup() : act.group())
    else if (mod && key === 'z') (e.shiftKey ? doRedo() : doUndo())
    else if (mod && key === 'y') doRedo()
    else if (mod && key === 'c') copySelection()
    else if (mod && key === 'x') { copySelection(); act.remove() }
    else if (mod && key === '0') setView((v) => zoomAt(v, 1 / v.zoom, { x: size.w / 2, y: size.h / 2 }))
    else if (!mod && key === 'f') fitTo(selRef.current.size > 0 ? itemsRef.current.filter((i) => selRef.current.has(i.id)) : itemsRef.current)
    else if (e.key === 'Home') fitTo(itemsRef.current)
    else if (mod && (key === ']' || e.code === 'BracketRight')) (e.shiftKey ? act.front() : act.forward())
    else if (mod && (key === '[' || e.code === 'BracketLeft')) (e.shiftKey ? act.back() : act.backward())
    else if (!mod && SHORTCUTS[e.shiftKey ? 'shift+' + key : key]) setTool(SHORTCUTS[e.shiftKey ? 'shift+' + key : key])
    else if (e.key === 'Escape') {
      setSelection(new Set()); setMenu(null); setEditing(null); setTool('select')
    }
    else if (e.key.startsWith('Arrow') && selRef.current.size > 0) {
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      withSelection((i, s) => moveItems(i, s, dx, dy))
    } else if (key === '+' || key === '=') setView((v) => zoomAt(v, 1.25, { x: size.w / 2, y: size.h / 2 }))
    else if (key === '-') setView((v) => zoomAt(v, 0.8, { x: size.w / 2, y: size.h / 2 }))
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() } // évite que Ctrl+D duplique la page entière, etc.
  }
  const onKeyUp = (e: React.KeyboardEvent) => { modifierChanged(e); if (e.key === ' ') setSpaceDown(false) }

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.target as HTMLElement
    if (target.closest('[data-ui]')) return
    const pt = local(e)
    const el = target.closest('[data-item]') as HTMLElement | null
    if (el && !selRef.current.has(el.dataset.item as string)) setSelection(expandGroups(itemsRef.current, [el.dataset.item as string]))
    setMenu({ x: pt.x, y: pt.y, world: screenToWorld(viewRef.current, pt), mode: 'full' })
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) void addFiles(files, screenToWorld(viewRef.current, local(e)))
  }

  const toggleOnTop = async () => {
    if (!isTauri()) { say("« Toujours au premier plan » n'existe que dans l'application Windows."); return }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().setAlwaysOnTop(!onTop)
      setOnTop(!onTop)
    } catch (err) { say(`Impossible : ${err instanceof Error ? err.message : String(err)}`) }
  }

  // Fond : par défaut la couleur de l'application, avec de petits points très discrets, ou uni.
  const isDark = bg === 'theme' ? appTheme === 'dark' : readableOn(bg) === '#ffffff'
  const textColor = isDark ? '#ffffff' : '#111111'
  const bgColor = bg === 'theme' ? 'var(--bg)' : bg
  const step = 28 * view.zoom
  // Les petits points sont discrets : ils se devinent à peine.
  const dotInk = isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.11)'
  const patternStyle: React.CSSProperties =
    pattern === 'dots' && step >= 8
      ? { backgroundImage: `radial-gradient(circle at center, ${dotInk} ${Math.max(1, view.zoom * 1.1)}px, transparent ${Math.max(1.4, view.zoom * 1.1 + 0.5)}px)`, backgroundSize: `${step}px ${step}px`, backgroundPosition: `${view.x - step / 2}px ${view.y - step / 2}px` }
      : {}
  const swatch = (b: string): React.CSSProperties => (b === 'theme' ? { background: 'linear-gradient(135deg, #ffffff 50%, #1f1f1f 50%)' } : { background: b })
  const zoom = view.zoom
  const hs = 11 / zoom

  // ── Rendu d'un élément ──
  const renderItem = (it: BoardItem, forceSel = false) => {
    const isSel = forceSel || selection.has(it.id)
    const base: React.CSSProperties = {
      position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h,
      outline: isSel && !(it.kind === 'shape' && it.shape === 'path') ? `${2 / zoom}px solid #4da3ff` : undefined, outlineOffset: 0,
      transform: it.rot ? `rotate(${it.rot}deg)` : undefined, transformOrigin: 'center',
      ...(it.kind === 'image' || it.kind === 'note' ? { borderRadius: 8 } : {}),
      ...(it.kind === 'image' ? { overflow: 'hidden', boxShadow: '0 10px 24px -14px rgba(0,0,0,.5), 0 1px 3px rgba(0,0,0,.12)' } : {}),
    }
    if (it.kind === 'image') {
      const a = it.assetId ? assets[it.assetId] : undefined
      const src = a ? (it.w * zoom > 480 ? a.data : a.thumb) : undefined
      return (
        <div key={it.id} data-item={it.id} style={base}>
          {src ? (
            <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', transform: `scale(${it.flipX ? -1 : 1}, ${it.flipY ? -1 : 1})` }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#555' }} />
          )}
        </div>
      )
    }
    if (it.kind === 'note') {
      const color = it.color ?? NOTE_COLORS[0]
      const ink = color === 'transparent' ? textColor : '#222'
      const common: React.CSSProperties = { width: '100%', height: '100%', padding: 12, fontSize: 16, lineHeight: 1.35, color: ink, fontFamily: 'inherit', boxSizing: 'border-box' }
      return (
        <div key={it.id} data-item={it.id} style={{ ...base, background: color, boxShadow: color === 'transparent' ? undefined : '0 2px 10px rgba(0,0,0,.25)', overflow: 'hidden' }}>
          {editing === it.id ? (
            <textarea
              autoFocus
              defaultValue={it.text}
              onBlur={(e) => { commitItems(itemsRef.current.map((i) => (i.id === it.id ? { ...i, text: e.target.value } : i))); setEditing(null) }}
              style={{ ...common, resize: 'none', border: 0, outline: 0, background: 'transparent' }}
            />
          ) : (
            <div style={{ ...common, whiteSpace: 'pre-wrap', overflow: 'hidden', pointerEvents: 'none' }}>{it.text || <span style={{ opacity: 0.4 }}>Note…</span>}</div>
          )}
        </div>
      )
    }
    if (it.kind === 'text') {
      const st = textStyleOf(it)
      const ps = paraStyleOf(it)
      const point = isPointText(it)
      const gs = glyphSize(st)
      const inkColor = it.color ?? textColor
      const decoration = [st.under ? 'underline' : '', st.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none'
      const glyphs: React.CSSProperties = {
        fontFamily: `"${st.font}", sans-serif`, fontSize: gs, fontWeight: st.weight, fontStyle: st.italic ? 'italic' : 'normal', fontVariantCaps: st.caps === 'small' ? 'small-caps' : 'normal',
        letterSpacing: `${st.ls}em`, color: inkColor, textDecoration: decoration, margin: 0,
      }
      // Les lettres sont dessinées dans un cadre à l'échelle (horizontale / verticale), décalé vers le haut pour la ligne de base.
      const scaled = (w: number): React.CSSProperties => ({ position: 'absolute', left: TEXT_PAD, top: TEXT_PAD, width: w, transformOrigin: '0 0', transform: `translateY(${-lift(st) * st.sy}px) scale(${st.sx}, ${st.sy})` })
      if (editing === it.id) {
        // En tapant, la boîte suit le texte : un texte de point s'allonge, une zone de texte grandit vers le bas. (Pendant la frappe, les retraits et les espaces entre paragraphes sont mis de côté.)
        const plain: BoardItem = { ...it, text: draft, indL: 0, indR: 0, indF: 0, spB: 0, spA: 0, hyph: false, list: 'none' }
        const box = measureTextBox(plain, measureFor(it))
        return (
          <div key={it.id} data-item={it.id} style={{ ...base, width: box.w, height: box.h, outline: `${1.5 / zoom}px dashed #4da3ff` }}>
            <div style={scaled((box.w - TEXT_PAD * 2) / st.sx)}>
              <textarea
                autoFocus
                value={draft}
                wrap={point ? 'off' : 'soft'}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                onBlur={() => finishText(it.id, draft)}
                style={{
                  ...glyphs, lineHeight: `${st.size * st.lh}px`, textAlign: ps.align === 'justify' ? 'left' : ps.align, textTransform: st.caps === 'all' ? 'uppercase' : 'none', padding: 0,
                  whiteSpace: point ? 'pre' : 'pre-wrap', overflowWrap: point ? 'normal' : 'anywhere', boxSizing: 'border-box', width: '100%', height: (box.h - TEXT_PAD * 2) / st.sy,
                  resize: 'none', border: 0, outline: 0, background: 'transparent', overflow: 'hidden', display: 'block',
                }}
              />
            </div>
          </div>
        )
      }
      if (!it.text) {
        return (
          <div key={it.id} data-item={it.id} style={base}>
            <div style={{ ...glyphs, padding: TEXT_PAD, lineHeight: st.lh, pointerEvents: 'none', opacity: 0.4 }}>Texte…</div>
          </div>
        )
      }
      // Chaque ligne est posée par nos soins (même découpage que le calcul de la boîte) : retraits, puces, justification et coupure des mots sont exacts.
      const paras = layoutParas(it, measureFor(it))
      const lineH = st.size * st.lh
      return (
        <div key={it.id} data-item={it.id} style={base}>
          <div style={{ ...scaled(Math.max(1, (it.w - TEXT_PAD * 2) / st.sx)), pointerEvents: 'none' }}>
            {paras.map((p, pi) => (
              <div key={pi} style={{ position: 'relative', marginTop: p.before, marginBottom: p.after }}>
                {p.marker && <span style={{ ...glyphs, position: 'absolute', left: p.markerLeft, top: 0, lineHeight: `${lineH}px`, whiteSpace: 'pre' }}>{p.marker}</span>}
                {p.lines.map((l, li) => {
                  const justify = ps.align === 'justify' && !l.last && !point
                  return (
                    <div
                      key={li}
                      style={{
                        ...glyphs, height: lineH, lineHeight: `${lineH}px`, paddingLeft: l.left, paddingRight: l.right, boxSizing: 'border-box',
                        textAlign: ps.align === 'justify' ? 'left' : ps.align, whiteSpace: justify ? 'normal' : 'pre', ...(justify ? { textAlign: 'justify', textAlignLast: 'justify' } : {}),
                      }}
                    >
                      {l.text === '' ? ' ' : l.text}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )
    }
    if (it.kind === 'shape') {
      const ss = shapeStyleOf(it)
      const linear = it.shape === 'line' || it.shape === 'arrow'
      const sw = linear ? Math.max(1, ss.sw) : ss.sw
      const color = ss.color
      const w = Math.max(2, it.w)
      const h = Math.max(2, it.h)
      const head = it.shape === 'arrow' ? arrowHead(sw, sw, w - sw, h - sw, Math.max(14, sw * 4)) : null
      const paint = { fill: ss.fill, stroke: sw > 0 ? color : 'none', strokeWidth: sw, strokeDasharray: dashArray(ss.dash, sw), strokeLinecap: ss.dash === 'dotted' ? ('round' as const) : undefined, strokeLinejoin: 'round' as const }
      return (
        <div key={it.id} data-item={it.id} style={base}>
          <svg width={w} height={h} style={{ display: 'block', overflow: 'visible', pointerEvents: 'none', opacity: ss.opacity, transform: `scale(${it.flipX ? -1 : 1}, ${it.flipY ? -1 : 1})` }}>
            {it.shape === 'ellipse' ? (
              <ellipse cx={w / 2} cy={h / 2} rx={Math.max(1, (w - sw) / 2)} ry={Math.max(1, (h - sw) / 2)} {...paint} />
            ) : it.shape === 'polygon' ? (
              <polygon points={pointsAttr(polygonPoints(w, h, ss.sides, sw / 2))} {...paint} />
            ) : it.shape === 'star' ? (
              <polygon points={pointsAttr(starPoints(w, h, ss.points, ss.inner, sw / 2))} {...paint} />
            ) : it.shape === 'path' ? (
              <>
                <path d={itemPathD(it, w, h)} fillRule="evenodd" {...paint} />
                {isSel && <path d={itemPathD(it, w, h)} fill="none" stroke="#4da3ff" strokeWidth={1.5 / zoom} strokeLinejoin="round" />}
              </>
            ) : it.shape === 'line' || it.shape === 'arrow' ? (
              <>
                <line x1={sw} y1={sw} x2={w - sw} y2={h - sw} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dashArray(ss.dash, sw)} />
                {head && <polygon points={head.map((pt) => pt.join(',')).join(' ')} fill={color} stroke={color} strokeWidth={sw / 2} strokeLinejoin="round" />}
              </>
            ) : (
              <rect x={sw / 2} y={sw / 2} width={Math.max(1, w - sw)} height={Math.max(1, h - sw)} rx={it.shape === 'rrect' ? cornerRadius(ss.radius, w - sw, h - sw) : 6} {...paint} />
            )}
          </svg>
        </div>
      )
    }
    if (it.kind === 'color') {
      const color = it.color ?? '#888888'
      return (
        <div key={it.id} data-item={it.id} style={{ ...base, background: color, display: 'flex', alignItems: 'flex-end', boxShadow: '0 1px 6px rgba(0,0,0,.3)' }}>
          <span style={{ padding: 8, fontSize: 14, fontFamily: 'monospace', color: readableOn(color), pointerEvents: 'none' }}>{color.toUpperCase()}</span>
        </div>
      )
    }
    return (
      <div key={it.id} data-item={it.id} style={{ ...base, background: textColor === '#ffffff' ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)', border: `1px solid ${textColor === '#ffffff' ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.2)'}`, borderRadius: 8, padding: '8px 12px', color: textColor, overflow: 'hidden', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>🔗 {it.text}</div>
        <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{it.url}</div>
      </div>
    )
  }

  const hasSel = selection.size > 0
  const selNotes = selected.some((i) => i.kind === 'note')
  const textSel = selected.filter((i) => i.kind === 'text')
  // Le panneau du texte est posé en bas à droite de la toile (comme les panneaux d'Illustrator), et la palette de couleurs reste en haut à droite.
  const showTextPanel = !compact && textSel.length > 0 && !marquee && !live
  const selGrouped = selected.some((i) => i.group)

  const MenuBtn = ({ label, onClick, danger, hint }: { label: string; onClick: () => void; danger?: boolean; hint?: string }) => (
    <button
      onClick={() => { setMenu(null); onClick() }}
      className={'flex w-full items-center justify-between gap-6 rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)] ' + (danger ? 'text-red-500' : '')}
    >
      <span>{label}</span>
      {hint && <span className="text-xs text-[var(--fg-muted)]">{hint}</span>}
    </button>
  )
  const MenuHead = ({ children }: { children: React.ReactNode }) => <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase text-[var(--fg-muted)]">{children}</div>

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full select-none overflow-hidden outline-none"
      style={{ backgroundColor: bgColor, ...patternStyle, cursor: panning ? vectorCursor('HandGrab') : spaceDown || tool === 'hand' ? vectorCursor('Hand') : tool === 'text' ? 'text' : engine ? vectorCursor(vcCursor) : 'default', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setTipAt(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${zoom})` }}>
        {items.map((it) => renderItem(it))}
        {engine && <VectorOverlay overlays={vcOverlays} zoom={zoom} tip={vcTip} tipAt={tipAt} />}
        {frame && !marquee && !editing && !engine && (
          <div style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h, transform: frame.rot ? `rotate(${frame.rot}deg)` : undefined, transformOrigin: 'center', outline: `${1 / zoom}px dashed #4da3ff`, pointerEvents: 'none' }}>
            {/* Zones de rotation : juste à l'extérieur des coins */}
            {([['nw', -22 / zoom, -22 / zoom], ['ne', frame.w, -22 / zoom], ['se', frame.w, frame.h], ['sw', -22 / zoom, frame.h]] as const).map(([c, left, top]) => (
              <div key={c} data-rotate={c} style={{ position: 'absolute', left, top, width: 22 / zoom, height: 22 / zoom, cursor: ROTATE_CURSOR, pointerEvents: 'auto' }} />
            ))}
            {HANDLES.filter((h) => isCorner(h) || !(selected.length === 1 && isPointText(selected[0]))).map((h) => {
              const at = handlePoint({ x: 0, y: 0, w: frame.w, h: frame.h }, h)
              return (
                <div
                  key={h}
                  data-handle={h}
                  style={{
                    position: 'absolute', width: hs, height: hs, background: '#fff', border: `${1.5 / zoom}px solid #4da3ff`, pointerEvents: 'auto',
                    left: at.x - hs / 2, top: at.y - hs / 2,
                    cursor: h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                />
              )
            })}
          </div>
        )}
        {guides.map((g, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', background: '#ff2d95', pointerEvents: 'none',
              ...(g.axis === 'x' ? { left: g.pos - 0.5 / zoom, top: g.from, width: 1 / zoom, height: g.to - g.from } : { left: g.from, top: g.pos - 0.5 / zoom, width: g.to - g.from, height: 1 / zoom }),
            }}
          />
        ))}
      </div>

      {marquee && <div style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: '1px solid #4da3ff', background: 'rgba(77,163,255,.12)', pointerEvents: 'none' }} />}

      {items.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center" style={{ color: textColor, opacity: 0.55 }}>
          <div>
            <div className={compact ? 'text-base font-semibold' : 'mb-2 text-2xl font-semibold'}>Dépose tes images ici</div>
            {!compact && <div className="text-sm">ou colle-les avec Ctrl+V · double-clic pour une note · clic droit ou Maj+A pour ajouter<br />molette = zoom · clic molette ou Espace + glisser = déplacer la toile</div>}
          </div>
        </div>
      )}

      {/* Barre d'outils */}
      {compact ? (
        <div data-ui className="absolute left-2 top-2 flex items-center gap-1.5">
          <button className={bar} title="Ajouter des images" onClick={() => fileInput.current?.click()}><ImagePlus size={14} className="mr-1 inline" />Images</button>
          <button className={bar} title="Tout afficher (F)" onClick={() => fitTo(items)}><Expand size={14} className="mr-1 inline" />Ajuster</button>
        </div>
      ) : (
      <div data-ui className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-center gap-2">
        {/* Ajouter : l'action principale, seule à gauche */}
        <button
          className={bar + ' pointer-events-auto !border-[var(--accent)] !bg-[var(--accent)] !text-white hover:!opacity-90'}
          title="Ajouter une image, un texte, une forme, un lien… (clic droit ou Maj+A sur la toile)"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const c = containerRef.current!.getBoundingClientRect(); setMenu({ x: r.left - c.left, y: r.bottom - c.top + 4, world: viewCenter(), mode: 'full', add: true }) }}
        ><Plus size={14} className="mr-1 inline" />Ajouter</button>

        {/* Mise en page : ranger et aligner ce qui est choisi */}
        <div className={group}>
          <button className={item} title="Organiser la sélection" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const c = containerRef.current!.getBoundingClientRect(); setMenu({ x: r.left - c.left, y: r.bottom - c.top + 4, world: viewCenter(), mode: 'organize' }) }}><LayoutGrid size={14} />Organiser</button>
          <button className={item} aria-pressed={alignOpen} title="Panneau Aligner : aligner et répartir la sélection" onClick={() => setAlignOpen(!alignOpen)}><AlignStartVertical size={14} />Aligner</button>
        </div>

        {/* Couleurs : la palette et le fond */}
        <div className={group}>
          <button className={item} aria-pressed={paletteOpen} title="Palette de couleurs" onClick={() => setPaletteOpen(!paletteOpen)}><PaletteIcon size={14} />Palette</button>
          <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
          {BACKGROUNDS.map((b) => (
            <button key={b} title={b === '#ffffff' ? 'Fond blanc' : 'Fond noir'} aria-label={b === '#ffffff' ? 'Fond blanc' : 'Fond noir'} aria-pressed={isDark === (b !== '#ffffff')} onClick={() => setBg(b)} className="mx-0.5 h-5 w-5 rounded-full" style={{ ...swatch(b), border: isDark === (b !== '#ffffff') ? '2px solid var(--accent)' : '1px solid var(--border)' }} />
          ))}
        </div>

        {/* Vue : cadrer et choisir le fond de la toile */}
        <div className={group}>
          <button className={item} title="Tout afficher (F)" onClick={() => fitTo(items)}><Expand size={14} />Ajuster</button>
          <button className={item} title="Fond de la toile : petits points ou uni" onClick={() => setPattern(PATTERNS[(PATTERNS.findIndex((p) => p.id === pattern) + 1) % PATTERNS.length].id)}>{PATTERNS.find((p) => p.id === pattern)?.label}</button>
        </div>

        {/* Fenêtre : à droite. Épingler = reste devant les autres fenêtres ; Fenêtre flottante = le moodboard s'ouvre dans une petite fenêtre à part et la page se ferme derrière. */}
        <div className={group + ' ml-auto'}>
          <button className={item} title={onTop ? 'Ne plus rester devant les autres fenêtres' : 'Rester devant les autres fenêtres (la fenêtre de Form reste au premier plan)'} aria-pressed={onTop} onClick={() => void toggleOnTop()}>{onTop ? <PinOff size={14} /> : <Pin size={14} />}Épingler</button>
          <button className={item} title="Fenêtre flottante : ouvre ce moodboard dans une petite fenêtre à part, toujours devant (comme PureRef) ; la page se ferme derrière" onClick={() => void openFloatingBoard(board.id, board.title).then((ok) => { if (!ok) say('La fenêtre flottante n’existe que dans l’application Windows.'); else useApp.getState().goBack() })}><PictureInPicture2 size={14} />Fenêtre flottante</button>
        </div>
      </div>
      )}
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const at = fileAt.current ?? viewCenter(); fileAt.current = null; void addFiles(Array.from(e.target.files ?? []), at); e.target.value = '' }} />

      {linkInput !== null && (
        <div data-ui className="absolute left-14 top-14 flex max-w-[24rem] flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2 shadow-[var(--shadow-lift)]">
          <input
            autoFocus
            value={linkInput}
            placeholder="Colle un lien (https://…)"
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setLinkInput(null)
              if (e.key === 'Enter' && looksLikeUrl(linkInput)) {
                const c = linkAt.current ?? viewCenter()
                linkAt.current = null
                addLink(linkInput, c)
                setLinkInput(null)
              }
            }}
            className="w-72 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          <p className="text-xs text-[var(--fg-muted)]">Un lien de <b>tableau ou d'épingle Pinterest</b>, ou de <b>post Instagram</b>, télécharge ses images et les pose sur la toile (au plus {IMPORT_LIMIT}). Un autre lien devient une carte.</p>
        </div>
      )}

      {importing && (
        <div data-ui className="absolute left-14 top-14 z-40 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] shadow-[var(--shadow-lift)]">
          Téléchargement en cours…
          <button className={bar} onClick={() => void invoke('saver_stop')}>Arrêter</button>
        </div>
      )}

      {showTextPanel && (() => {
        const first = textSel[0]
        const st = textStyleOf(first)
        const ps = paraStyleOf(first)
        const field = 'rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] outline-none focus:border-[var(--accent)]'
        const toggle = (on: boolean) => 'flex h-7 min-w-7 items-center justify-center rounded-lg border bg-[var(--bg)] px-1.5 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-hover)] ' + (on ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--fg)]')
        const row = 'flex items-center gap-2'
        const label = 'w-24 shrink-0 text-[var(--fg-muted)]'
        const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
        const round1 = (v: number) => Math.round(v * 10) / 10
        // Un champ chiffré (valeur en points, en % ou en ‰) : on tape, la valeur est bornée puis appliquée.
        const num = (name: string, value: number, unit: string, set: (v: number) => void, step = 1) => (
          <div className={row}>
            <span className={label}>{name}</span>
            <input className={field + ' w-16!'} type="number" step={step} value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set(v) }} aria-label={`${name} (${unit})`} />
            <span className="text-[var(--fg-muted)]">{unit}</span>
          </div>
        )
        const leadingPt = round1(st.size * st.lh)
        const boxes = (list: [boolean, React.ReactNode, string, () => void][]) => list.map(([on, text, title, fn]) => <button key={title} className={toggle(on)} onClick={fn} title={title} aria-label={title} aria-pressed={on}>{text}</button>)
        return (
          <>
            {/* Comme dans Illustrator : une fine colonne d'icônes (Caractère, Paragraphe) ; un clic ouvre le panneau à côté, avec ses onglets ; « × » le range. */}
            <FloatPanel id="text-strip" slim title="Texte" icon={<Type size={14} />} anchor={{ x: 'right', y: 'top', dy: 56 }} className="w-12">
              <button className={stripBtn(textTab === 'char')} aria-pressed={textTab === 'char'} title="Caractère : police, taille, couleur…" aria-label="Caractère" onClick={() => setTextTab(textTab === 'char' ? null : 'char')}><ALargeSmall size={19} /></button>
              <button className={stripBtn(textTab === 'para')} aria-pressed={textTab === 'para'} title="Paragraphe : alignement, retraits, espaces…" aria-label="Paragraphe" onClick={() => setTextTab(textTab === 'para' ? null : 'para')}><Pilcrow size={19} /></button>
            </FloatPanel>
            {textTab && (
              <FloatPanel
                id="text-panel"
                noCollapse
                title="Texte"
                icon={<Type size={14} />}
                anchor={{ x: 'right', y: 'top', dx: 68, dy: 56 }}
                nextTo="text-strip"
                className="w-64"
                onClose={() => setTextTab(null)}
                headerContent={(
                  <div className="flex flex-1 items-center gap-0.5 rounded-xl bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] p-0.5" role="tablist">
                    <button data-nodrag role="tab" aria-selected={textTab === 'char'} className={tabBtn(textTab === 'char')} onClick={() => setTextTab('char')}>{`Caractère${textSel.length > 1 ? ` (${textSel.length})` : ''}`}</button>
                    <button data-nodrag role="tab" aria-selected={textTab === 'para'} className={tabBtn(textTab === 'para')} onClick={() => setTextTab('para')}>Paragraphe</button>
                  </div>
                )}
              >
                {textTab === 'char' ? (
                  <>
            <select className={field + ' w-full'} value={st.font} onChange={(e) => setTextProps({ font: e.target.value })} aria-label="Police">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className={row}>
              <select className={field + ' min-w-0 flex-1'} value={st.weight} onChange={(e) => { const w = Number(e.target.value); setTextProps({ weight: w, bold: w >= 600 }) }} aria-label="Style de la police">
                {WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
              <button className={toggle(st.italic)} onClick={() => setTextProps({ italic: !st.italic })} title="Italique" aria-label="Italique" aria-pressed={st.italic}><Italic size={13} /></button>
            </div>
            {num('Taille', Math.round(st.size * 10) / 10, 'pt', (v) => setTextProps({ size: clamp(v, 6, 600) }), 1)}
            {num('Interlignage', leadingPt, 'pt', (v) => setTextProps({ lh: clamp(v / st.size, 0.6, 3) }), 1)}
            {num('Approche', Math.round(st.ls * 1000), '‰', (v) => setTextProps({ ls: clamp(v / 1000, -0.2, 1) }), 10)}
            {num('Échelle horiz.', Math.round(st.sx * 100), '%', (v) => setTextProps({ sx: clamp(v / 100, 0.1, 4) }), 5)}
            {num('Échelle vert.', Math.round(st.sy * 100), '%', (v) => setTextProps({ sy: clamp(v / 100, 0.1, 4) }), 5)}
            {num('Ligne de base', round1(st.base), 'pt', (v) => setTextProps({ base: clamp(v, -300, 300) }), 1)}
            {num('Rotation', Math.round(first.rot ?? 0), '°', (v) => setTextProps({ rot: clamp(v, -360, 360) }), 5)}
            <div className="flex flex-wrap gap-1">
              {boxes([
                [st.caps === 'all', 'TT', 'Tout en majuscules', () => setTextProps({ caps: st.caps === 'all' ? 'none' : 'all' })],
                [st.caps === 'small', 'Tt', 'Petites capitales', () => setTextProps({ caps: st.caps === 'small' ? 'none' : 'small' })],
                [st.script === 'sup', 'T¹', 'Exposant', () => setTextProps({ script: st.script === 'sup' ? 'none' : 'sup' })],
                [st.script === 'sub', 'T₁', 'Indice', () => setTextProps({ script: st.script === 'sub' ? 'none' : 'sub' })],
                [st.under, <Underline size={13} />, 'Souligné', () => setTextProps({ under: !st.under })],
                [st.strike, <Strikethrough size={13} />, 'Barré', () => setTextProps({ strike: !st.strike })],
              ])}
            </div>
            <div className={row}>
              <span className={label}>Couleur</span>
              <input type="color" className="h-7 w-10 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-0" value={/^#[0-9a-f]{6}$/i.test(first.color ?? '') ? (first.color as string) : isDark ? '#ffffff' : '#111111'} onChange={(e) => setTextProps({ color: e.target.value })} aria-label="Couleur du texte" />
            </div>

                  </>
                ) : (
                  <>
            <div className="flex flex-wrap gap-1">
              <button className={toggle(ps.align === 'left')} onClick={() => setTextProps({ align: 'left' })} title="Aligné à gauche"><AlignLeft size={13} /></button>
              <button className={toggle(ps.align === 'center')} onClick={() => setTextProps({ align: 'center' })} title="Centré"><AlignCenter size={13} /></button>
              <button className={toggle(ps.align === 'right')} onClick={() => setTextProps({ align: 'right' })} title="Aligné à droite"><AlignRight size={13} /></button>
              <button className={toggle(ps.align === 'justify')} onClick={() => setTextProps({ align: 'justify' })} title="Justifié (visible dans une zone de texte)"><AlignJustify size={13} /></button>
              <button className={toggle(ps.list === 'bullet')} onClick={() => setTextProps({ list: ps.list === 'bullet' ? 'none' : 'bullet' })} title="Liste à puces"><List size={13} /></button>
              <button className={toggle(ps.list === 'number')} onClick={() => setTextProps({ list: ps.list === 'number' ? 'none' : 'number' })} title="Liste numérotée"><ListOrdered size={13} /></button>
            </div>
            {num('Retrait gauche', round1(ps.indL), 'pt', (v) => setTextProps({ indL: clamp(v, 0, 600) }), 1)}
            {num('Retrait droit', round1(ps.indR), 'pt', (v) => setTextProps({ indR: clamp(v, 0, 600) }), 1)}
            {num('1re ligne', round1(ps.indF), 'pt', (v) => setTextProps({ indF: clamp(v, -600, 600) }), 1)}
            {num('Espace avant', round1(ps.spB), 'pt', (v) => setTextProps({ spB: clamp(v, 0, 300) }), 1)}
            {num('Espace après', round1(ps.spA), 'pt', (v) => setTextProps({ spA: clamp(v, 0, 300) }), 1)}
            <label className="flex items-center gap-2" title="Coupe les longs mots avec un trait d'union (zone de texte)">
              <input type="checkbox" checked={ps.hyph} onChange={(e) => setTextProps({ hyph: e.target.checked })} />
              <span>Couper les mots</span>
            </label>
                  </>
                )}
              </FloatPanel>
            )}
          </>
        )
      })()}

      {alignOpen && !compact && (() => {
        const n = selection.size
        const ic = (on: boolean) => 'flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--bg-hover)] disabled:opacity-30' + (on ? '' : '')
        const can = n >= 1 && (alignRef === 'screen' || n >= 2)
        const row = 'flex gap-1'
        const pick = (id: 'selection' | 'screen' | 'key', text: string, title: string) => (
          <button key={id} title={title} aria-pressed={alignRef === id} onClick={() => setAlignRef(id)} className={'rounded border px-2 py-1 text-[11px] ' + (alignRef === id ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--fg)] hover:bg-[var(--bg-hover)]')}>{text}</button>
        )
        return (
          <FloatPanel id="align" title="Aligner" icon={<AlignStartVertical size={14} />} anchor={{ x: 'left', y: 'top', dx: 104, dy: 56 }} className="w-52" onClose={() => setAlignOpen(false)}>
            <div className="text-[var(--fg-muted)]">Aligner sur</div>
            <div className={row}>
              {pick('selection', 'Sélection', 'Le cadre de la sélection')}
              {pick('screen', 'Écran', 'La partie visible de la toile')}
              {pick('key', 'Objet clé', 'Le dernier élément sélectionné (Maj+clic) ne bouge pas, les autres s’alignent sur lui')}
            </div>
            {alignRef === 'key' && <div className="text-[var(--fg-muted)]">Objet clé : le dernier sélectionné (Maj+clic pour le choisir).</div>}
            <div className="text-[var(--fg-muted)]">Aligner les objets</div>
            <div className={row}>
              {([['left', AlignStartVertical, 'Aligner à gauche'], ['hcenter', AlignCenterVertical, 'Centrer horizontalement'], ['right', AlignEndVertical, 'Aligner à droite'], ['top', AlignStartHorizontal, 'Aligner en haut'], ['vcenter', AlignCenterHorizontal, 'Centrer verticalement'], ['bottom', AlignEndHorizontal, 'Aligner en bas']] as const).map(([m, Ico, t]) => (
                <button key={m} className={ic(false)} title={t} aria-label={t} disabled={!can} onClick={() => act.alignOn(m)}><Ico size={14} /></button>
              ))}
            </div>
            <div className="text-[var(--fg-muted)]">Répartir les objets (3 ou plus)</div>
            <div className={row}>
              {([['left', AlignHorizontalDistributeStart, 'Répartir les bords gauches'], ['hcenter', AlignHorizontalDistributeCenter, 'Répartir les centres (horizontal)'], ['right', AlignHorizontalDistributeEnd, 'Répartir les bords droits'], ['top', AlignVerticalDistributeStart, 'Répartir les bords hauts'], ['vcenter', AlignVerticalDistributeCenter, 'Répartir les centres (vertical)'], ['bottom', AlignVerticalDistributeEnd, 'Répartir les bords bas']] as const).map(([m, Ico, t]) => (
                <button key={m} className={ic(false)} title={t} aria-label={t} disabled={n < 3} onClick={() => act.distribute(m)}><Ico size={14} /></button>
              ))}
            </div>
            <div className="text-[var(--fg-muted)]">Répartir les espaces</div>
            <div className="flex items-center gap-1">
              <button className={ic(false)} title="Mêmes espaces à l’horizontale" aria-label="Mêmes espaces à l’horizontale" disabled={n < 3} onClick={() => act.space('x')}><AlignHorizontalSpaceBetween size={14} /></button>
              <button className={ic(false)} title="Mêmes espaces à la verticale" aria-label="Mêmes espaces à la verticale" disabled={n < 3} onClick={() => act.space('y')}><AlignVerticalSpaceBetween size={14} /></button>
              <input className="lib-input ml-1 w-14 rounded-lg border px-2 py-1 text-xs outline-none" type="number" placeholder="auto" value={spaceInput} onChange={(e) => setSpaceInput(e.target.value)} aria-label="Espace imposé entre les éléments (pt)" title="Espace imposé entre les éléments ; vide = espaces égaux" />
              <span className="text-[var(--fg-muted)]">pt</span>
            </div>
            {n === 0 && <div className="text-[var(--fg-muted)]">Sélectionne des éléments (Maj+clic pour en ajouter).</div>}
          </FloatPanel>
        )
      })()}

      {!compact && <VectorToolbar tool={tool} onTool={setTool} paint={paint} onPaint={changePaint} />}

      {/* Zoom et message */}
      {!compact && (
      <div data-ui className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-[var(--fg)]">
        <button className={bar} onClick={() => setView((v) => zoomAt(v, 0.8, { x: size.w / 2, y: size.h / 2 }))}>−</button>
        <button className="w-12 rounded text-center tabular-nums hover:bg-[var(--bg-hover)]" title="Remettre à 100 %" onClick={() => setView((v) => zoomAt(v, 1 / v.zoom, { x: size.w / 2, y: size.h / 2 }))}>{Math.round(zoom * 100)} %</button>
        <button className={bar} onClick={() => setView((v) => zoomAt(v, 1.25, { x: size.w / 2, y: size.h / 2 }))}>+</button>
        <button className={bar} disabled={hist.past.length === 0} onClick={doUndo} title="Annuler (Ctrl+Z)">↶</button>
        <button className={bar} disabled={hist.future.length === 0} onClick={doRedo} title="Rétablir (Ctrl+Y)">↷</button>
        <span>{items.length} élément{items.length > 1 ? 's' : ''}{hasSel ? ` · ${selection.size} sélectionné${selection.size > 1 ? 's' : ''}` : ''}</span>
      </div>
      )}
      {/* L'aide de l'outil, comme la barre d'état de VectorCraft */}
      {!compact && !showTextPanel && TOOL_HINTS[tool === 'select' ? 'selection' : tool === 'text' ? 'type' : tool] && (
        hintOpen ? (
          <div data-ui className="absolute bottom-12 left-3 flex w-64 flex-col gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]/90 px-3 py-2 text-[11px] leading-snug text-[var(--fg-muted)] shadow-sm">
            <div className="mb-0.5 flex items-center justify-between">
              <span className="lib-count">Aide</span>
              <button className="rounded-md p-0.5 hover:bg-[var(--bg-hover)]" title="Réduire l'aide" aria-label="Réduire l'aide" onClick={() => toggleHint(false)}><ChevronDown size={14} /></button>
            </div>
            {hintLines(TOOL_HINTS[tool === 'select' ? 'selection' : tool === 'text' ? 'type' : tool]).map((line, i) => <div key={i}>{line}</div>)}
          </div>
        ) : (
          <button data-ui className="absolute bottom-12 left-3 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)]/90 text-[var(--fg-muted)] shadow-sm hover:text-[var(--fg)]" title="Afficher l'aide des outils" aria-label="Afficher l'aide des outils" onClick={() => toggleHint(true)}><CircleHelp size={15} /></button>
        )
      )}
      {isFloatingElsewhere && (
        <div data-ui className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--bg)]/95 p-6 text-center">
          <PictureInPicture2 size={28} className="text-[var(--fg-muted)]" />
          <p className="text-sm">Ce moodboard est ouvert dans une fenêtre flottante.<br /><span className="text-[var(--fg-muted)]">Pour éviter d’écraser tes modifications, on ne le modifie pas ici en même temps.</span></p>
          <button className={bar} onClick={() => void closeFloatingBoard(board.id).then(() => useApp.getState().setFloatingBoard(board.id, false))}>Fermer la fenêtre flottante et reprendre ici</button>
        </div>
      )}
      {engine && <ToolOptionsPanel tool={engine} options={vcOptions} onChange={(key, value) => { rememberOption(engine, key, value); void vc.current.option(key, value, viewRef.current.zoom).then((out) => vcApply(out, 'move')) }} />}
      {flash && <div data-ui className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-[var(--fg)] px-3 py-1.5 text-sm text-[var(--bg)] shadow-lg">{flash}</div>}

      {paletteOpen && !compact && (
        <FloatPanel id="palette" title={`Palette ${selected.some((i) => i.kind === 'image') ? 'de la sélection' : 'de la toile'}`} icon={<PaletteIcon size={14} />} anchor={{ x: 'right', y: 'top', dx: 76, dy: 56 }} className="w-52" onClose={() => setPaletteOpen(false)}>
                    {palette.length === 0 && <div className="text-sm text-[var(--fg-muted)]">Ajoute des images pour en extraire les couleurs.</div>}
          <div className="grid grid-cols-2 gap-2">
            {palette.map((c) => (
              <button key={c} title="Copier la couleur" onClick={() => void navigator.clipboard.writeText(c).then(() => say(`Couleur copiée : ${c}`))} className="overflow-hidden rounded-lg border border-[var(--border)] text-left">
                <div className="h-10" style={{ background: c }} />
                <div className="px-1 py-0.5 font-mono text-[11px]">{c}</div>
              </button>
            ))}
          </div>
          {palette.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              <button className={bar} onClick={() => { const c = viewCenter(); const swatches = palette.map((hex, i) => makeSwatch({ x: c.x - (palette.length * 70) / 2 + i * 70, y: c.y - 30 }, hex)).map((s) => ({ ...s, w: 64, h: 64 })); commitItems([...itemsRef.current, ...swatches]); setSelection(new Set(swatches.map((s) => s.id))) }}>Ajouter à la toile</button>
              <button className={bar} onClick={() => void navigator.clipboard.writeText(palette.join(' ')).then(() => say('Palette copiée'))}>Copier toutes les couleurs</button>
            </div>
          )}
        </FloatPanel>
      )}

      {/* Menu contextuel */}
      {menu && (
        <>
          <div data-ui className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div data-ui data-scroll className="absolute z-50 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1 text-[var(--fg)] shadow-xl" style={{ left: Math.max(0, Math.min(menu.x, size.w - 290)), top: Math.min(menu.y, Math.max(8, size.h - 400)) }}>
            {menu.mode === 'full' && (
              <>
                <button
                  onClick={() => setMenu({ ...menu, add: !menu.add })}
                  className="flex w-full items-center justify-between gap-6 rounded px-2 py-1 text-left text-sm font-medium hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex items-center gap-1.5"><Plus size={14} /> Ajouter</span>
                  <span className="text-xs font-normal text-[var(--fg-muted)]">Maj+A</span>
                </button>
                {menu.add && (
                  <div className="mb-1 ml-3 border-l border-[var(--border)] pl-1">
                    <MenuBtn label="Image…" onClick={() => { fileAt.current = menu.world; fileInput.current?.click() }} />
                    <MenuBtn label="Texte" onClick={() => addText(menu.world)} />
                    <MenuBtn label="Note" onClick={() => addNote({ x: menu.world.x - 110, y: menu.world.y - 70 })} />
                    <MenuHead>Forme</MenuHead>
                    {SHAPES.map((sh) => <MenuBtn key={sh.id} label={sh.label} onClick={() => addShape(menu.world, sh.id)} />)}
                    <MenuHead>Autres</MenuHead>
                    <MenuBtn label="Lien (Pinterest, Instagram, autre)…" onClick={() => { linkAt.current = menu.world; setLinkInput('') }} />
                  </div>
                )}
                <div className="my-1 border-t border-[var(--border)]" />
              </>
            )}
            {menu.mode === 'full' && !hasSel && (
              <>
                <MenuBtn label="Tout sélectionner" hint="Ctrl+A" onClick={act.selectAll} />
                <MenuBtn label="Tout afficher" hint="F" onClick={() => fitTo(items)} />
                <MenuHead>Fond</MenuHead>
                <div className="flex gap-2 px-2 py-1">{BACKGROUNDS.map((b) => <button key={b} title={b === '#ffffff' ? 'Fond blanc' : 'Fond noir'} onClick={() => { setBg(b); setMenu(null) }} className="h-6 w-6 rounded-full border border-[var(--border)]" style={swatch(b)} />)}</div>
              </>
            )}
            {(hasSel || menu.mode === 'organize') && (
              <>
                {menu.mode === 'full' && (
                  <>
                    <MenuBtn label="Dupliquer" hint="Ctrl+D" onClick={act.duplicate} />
                    {selected.length === 1 && selected[0].kind === 'image' && selected[0].assetId && (
                      <MenuBtn
                        label="Image de couverture du moodboard"
                        onClick={() => {
                          const assetId = selected[0].assetId as string
                          const current = useApp.getState().objects.find((o) => o.id === boardId)
                          void useApp.getState().update(boardId, { properties: withCoverAsset(current?.properties ?? null, assetId) }).then(() => say('Cette image passe en avant sur la carte du moodboard'))
                        }}
                      />
                    )}
                    <MenuBtn label="Retourner (gauche-droite)" onClick={() => act.flip('x')} />
                    <MenuBtn label="Retourner (haut-bas)" onClick={() => act.flip('y')} />
                    {/* Disposition (comme « Arrange » d'Illustrator) : l'ordre des éléments, dans un sous-menu qui se déplie. */}
                    <button
                      className="flex w-full items-center justify-between gap-6 rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)]"
                      aria-expanded={arrangeOpen}
                      onClick={() => setArrangeOpen(!arrangeOpen)}
                    >
                      <span>Disposition</span>
                      <span className="text-xs text-[var(--fg-muted)]">{arrangeOpen ? '▾' : '▸'}</span>
                    </button>
                    {arrangeOpen && (
                      <div className="ml-3 border-l border-[var(--border)] pl-1">
                        <MenuBtn label="Mettre au premier plan" hint="Ctrl+Maj+]" onClick={act.front} />
                        <MenuBtn label="Avancer d'un cran" hint="Ctrl+]" onClick={act.forward} />
                        <MenuBtn label="Reculer d'un cran" hint="Ctrl+[" onClick={act.backward} />
                        <MenuBtn label="Mettre à l'arrière-plan" hint="Ctrl+Maj+[" onClick={act.back} />
                      </div>
                    )}
                    {selection.size > 1 && !selGrouped && <MenuBtn label="Grouper" hint="Ctrl+G" onClick={act.group} />}
                    {selGrouped && <MenuBtn label="Dissocier" hint="Ctrl+Maj+G" onClick={act.ungroup} />}
                    {selNotes && (
                      <>
                        <MenuHead>Couleur de la note</MenuHead>
                        <div className="flex gap-2 px-2 py-1">{NOTE_COLORS.map((c) => <button key={c} onClick={() => { act.noteColor(c); setMenu(null) }} className="h-6 w-6 rounded-full border border-[var(--border)]" style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 8px 8px' : c }} />)}</div>
                      </>
                    )}
                  </>
                )}
                {selection.size > 1 && (
                  <>
                    <MenuHead>Organiser</MenuHead>
                    <MenuBtn label="En mosaïque" onClick={act.flow} />
                    <MenuBtn label="En ligne" onClick={act.row} />
                    <MenuBtn label="En colonne" onClick={act.column} />
                    <MenuBtn label="En grille" onClick={act.grid} />
                    <MenuHead>Mettre à la même…</MenuHead>
                    <MenuBtn label="Hauteur" onClick={() => act.normalize('height')} />
                    <MenuBtn label="Largeur" onClick={() => act.normalize('width')} />
                    <MenuBtn label="Surface" onClick={() => act.normalize('area')} />
                    <MenuHead>Aligner</MenuHead>
                    <div className="grid grid-cols-3">
                      <MenuBtn label="Gauche" onClick={() => act.align('left')} />
                      <MenuBtn label="Centre" onClick={() => act.align('hcenter')} />
                      <MenuBtn label="Droite" onClick={() => act.align('right')} />
                      <MenuBtn label="Haut" onClick={() => act.align('top')} />
                      <MenuBtn label="Milieu" onClick={() => act.align('vcenter')} />
                      <MenuBtn label="Bas" onClick={() => act.align('bottom')} />
                    </div>
                  </>
                )}
                {selection.size <= 1 && menu.mode === 'organize' && <div className="px-2 py-2 text-sm text-[var(--fg-muted)]">Sélectionne plusieurs éléments (rectangle de sélection ou Maj+clic) pour les organiser.</div>}
                {menu.mode === 'full' && (<><div className="my-1 border-t border-[var(--border)]" /><MenuBtn label="Supprimer" hint="Suppr" danger onClick={act.remove} /></>)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
