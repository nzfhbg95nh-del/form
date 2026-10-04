import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Expand, ImagePlus, LayoutGrid, Link2, Palette as PaletteIcon, Pin, PinOff, StickyNote, Droplet } from 'lucide-react'
import { samplePixels, processImage } from '@/lib/images'
import {
  alignItems, arrangeColumn, arrangeFlow, arrangeGrid, arrangeRow, BACKGROUNDS, boundsOf, bringToFront, commit, duplicateItems,
  expandGroups, fitView, flipItems, groupItems, itemsInRect, looksLikeUrl, makeImage, makeLink, makeNote, makeSwatch, moveItems,
  newHistory, newId, normalizeItems, normalizeRect, NOTE_COLORS, parseBoard, PATTERNS, redo, removeItems, scaleItems, screenToWorld,
  sendToBack, serializeBoard, undo, ungroupItems, worldToScreen, zoomAt,
  type AlignMode, type Board, type BoardItem, type NormalizeMode, type Pattern, type Rect, type View,
} from '@/lib/moodboard'
import { extractPalette, mergePalettes, readableOn } from '@/lib/palette'
import { isTauri } from '@/lib/repo'
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
  | { type: 'move'; start: Pt; ids: Set<string>; items: BoardItem[] }
  | { type: 'resize'; anchor: Pt; startPt: Pt; ids: Set<string>; items: BoardItem[]; free: boolean }
  | { type: 'marquee'; start: Pt; base: Set<string>; items: BoardItem[] }

const HANDLES = ['nw', 'ne', 'sw', 'se'] as const
const bar = 'rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] shadow-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

// Presse-papiers interne : copier / coller des éléments de la toile.
let internalClip: { stamp: string; items: BoardItem[] } | null = null

/** `compact` : version allégée pour le cadre d'une page (juste Images et Ajuster, sans barre du bas ni palette). */
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
  const [menu, setMenu] = useState<{ x: number; y: number; world: Pt; mode: 'full' | 'organize' } | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palette, setPalette] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState<string | null>(null)
  const [onTop, setOnTop] = useState(false)
  const [panning, setPanning] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const colorInput = useRef<HTMLInputElement>(null)
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
        const link = makeLink({ x: center.x - 130, y: center.y - 32 }, text.trim())
        commitItems([...itemsRef.current, link])
        setSelection(new Set([link.id]))
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

    if (e.button === 1 || (e.button === 0 && (spaceDown || e.altKey))) {
      e.preventDefault()
      dragRef.current = { type: 'pan', start: pt, view: v }
      setPanning(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return

    const world = screenToWorld(v, pt)
    const cur = itemsRef.current
    const handle = target.dataset.handle
    if (handle && selBox) {
      const box = selBox
      const anchor = { x: handle.includes('w') ? box.x + box.w : box.x, y: handle.includes('n') ? box.y + box.h : box.y }
      const single = cur.filter((i) => selRef.current.has(i.id))
      const free = single.length === 1 && single[0].kind !== 'image'
      dragRef.current = { type: 'resize', anchor, startPt: world, ids: new Set(selRef.current), items: cur, free }
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
        dragRef.current = { type: 'move', start: world, ids: sel, items: cur }
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
    const d = dragRef.current
    if (!d) return
    const pt = local(e)
    const v = viewRef.current
    const world = screenToWorld(v, pt)
    if (d.type === 'pan') {
      setView({ ...d.view, x: d.view.x + pt.x - d.start.x, y: d.view.y + pt.y - d.start.y })
    } else if (d.type === 'move') {
      const dx = world.x - d.start.x
      const dy = world.y - d.start.y
      if (live || Math.hypot(dx, dy) * v.zoom > 3) setLive(moveItems(d.items, d.ids, dx, dy))
    } else if (d.type === 'resize') {
      const sx = d.startPt.x - d.anchor.x
      const sy = d.startPt.y - d.anchor.y
      if (d.free) {
        const fx = Math.max(0.05, (world.x - d.anchor.x) / (sx || 1))
        const fy = Math.max(0.05, (world.y - d.anchor.y) / (sy || 1))
        setLive(scaleItems(d.items, d.ids, d.anchor, fx, fy))
      } else {
        const dot = (world.x - d.anchor.x) * sx + (world.y - d.anchor.y) * sy
        const f = Math.max(0.05, dot / (sx * sx + sy * sy || 1))
        setLive(scaleItems(d.items, d.ids, d.anchor, f, f))
      }
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
    if ((d.type === 'move' || d.type === 'resize') && live) commitItems(live)
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
    const world = screenToWorld(viewRef.current, local(e))
    const el = target.closest('[data-item]') as HTMLElement | null
    if (!el) { addNote({ x: world.x - 110, y: world.y - 70 }); return }
    const it = itemsRef.current.find((i) => i.id === el.dataset.item)
    if (!it) return
    if (it.kind === 'note') setEditing(it.id)
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
    flip: (axis: 'x' | 'y') => withSelection((i, s) => flipItems(i, s, axis)),
    flow: () => withSelection((i, s) => arrangeFlow(i, s)),
    row: () => withSelection((i, s) => arrangeRow(i, s)),
    column: () => withSelection((i, s) => arrangeColumn(i, s)),
    grid: () => withSelection((i, s) => arrangeGrid(i, s)),
    normalize: (m: NormalizeMode) => withSelection((i, s) => normalizeItems(i, s, m)),
    align: (m: AlignMode) => withSelection((i, s) => alignItems(i, s, m)),
    noteColor: (color: string) => withSelection((i, s) => i.map((it) => (s.has(it.id) && it.kind === 'note' ? { ...it, color } : it))),
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (e.key === 'Escape') (e.target as HTMLElement).blur()
      return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    let handled = true
    if (e.key === ' ') setSpaceDown(true)
    else if (e.key === 'Delete' || e.key === 'Backspace') act.remove()
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
    else if (e.key === 'Escape') { setSelection(new Set()); setMenu(null); setEditing(null) }
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
  const onKeyUp = (e: React.KeyboardEvent) => { if (e.key === ' ') setSpaceDown(false) }

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

  // Fond : par défaut la couleur de l'application, avec un motif de points espacés comme un cahier à points.
  const isDark = bg === 'theme' ? appTheme === 'dark' : readableOn(bg) === '#ffffff'
  const textColor = isDark ? '#ffffff' : '#111111'
  const bgColor = bg === 'theme' ? 'var(--bg)' : bg
  const step = 28 * view.zoom
  const ink = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.22)'
  const patternStyle: React.CSSProperties =
    pattern === 'dots' && step >= 8
      ? { backgroundImage: `radial-gradient(circle at center, ${ink} ${Math.max(1, view.zoom * 1.1)}px, transparent ${Math.max(1.4, view.zoom * 1.1 + 0.5)}px)`, backgroundSize: `${step}px ${step}px`, backgroundPosition: `${view.x - step / 2}px ${view.y - step / 2}px` }
      : pattern === 'grid' && step >= 8
        ? { backgroundImage: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`, backgroundSize: `${step}px ${step}px`, backgroundPosition: `${view.x}px ${view.y}px` }
        : {}
  const swatch = (b: string): React.CSSProperties => (b === 'theme' ? { background: 'linear-gradient(135deg, #ffffff 50%, #1f1f1f 50%)' } : { background: b })
  const zoom = view.zoom
  const hs = 11 / zoom

  // ── Rendu d'un élément ──
  const renderItem = (it: BoardItem) => {
    const isSel = selection.has(it.id)
    const base: React.CSSProperties = {
      position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h,
      outline: isSel ? `${2 / zoom}px solid #4da3ff` : undefined, outlineOffset: 0,
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
      style={{ backgroundColor: bgColor, ...patternStyle, cursor: panning ? 'grabbing' : spaceDown ? 'grab' : 'default', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${zoom})` }}>
        {items.map(renderItem)}
        {selBox && !marquee && !editing && (
          <>
            <div style={{ position: 'absolute', left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h, outline: `${1 / zoom}px dashed #4da3ff`, pointerEvents: 'none' }} />
            {HANDLES.map((h) => (
              <div
                key={h}
                data-handle={h}
                style={{
                  position: 'absolute', width: hs, height: hs, background: '#fff', border: `${1.5 / zoom}px solid #4da3ff`,
                  left: (h.includes('w') ? selBox.x : selBox.x + selBox.w) - hs / 2, top: (h.includes('n') ? selBox.y : selBox.y + selBox.h) - hs / 2,
                  cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                }}
              />
            ))}
          </>
        )}
      </div>

      {marquee && <div style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: '1px solid #4da3ff', background: 'rgba(77,163,255,.12)', pointerEvents: 'none' }} />}

      {items.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center" style={{ color: textColor, opacity: 0.55 }}>
          <div>
            <div className={compact ? 'text-base font-semibold' : 'mb-2 text-2xl font-semibold'}>Dépose tes images ici</div>
            {!compact && <div className="text-sm">ou colle-les avec Ctrl+V · double-clic pour une note<br />molette = zoom · clic molette ou Espace + glisser = déplacer la toile</div>}
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
      <div data-ui className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        <button className={bar} title="Ajouter des images" onClick={() => fileInput.current?.click()}><ImagePlus size={14} className="mr-1 inline" />Images</button>
        <button className={bar} title="Nouvelle note" onClick={() => { const c = viewCenter(); addNote({ x: c.x - 110, y: c.y - 70 }) }}><StickyNote size={14} className="mr-1 inline" />Note</button>
        <button className={bar} title="Nouvelle couleur" onClick={() => colorInput.current?.click()}><Droplet size={14} className="mr-1 inline" />Couleur</button>
        <button className={bar} title="Nouveau lien" onClick={() => setLinkInput(linkInput === null ? '' : null)}><Link2 size={14} className="mr-1 inline" />Lien</button>
        <button className={bar} title="Organiser la sélection" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const c = containerRef.current!.getBoundingClientRect(); setMenu({ x: r.left - c.left, y: r.bottom - c.top + 4, world: viewCenter(), mode: 'organize' }) }}><LayoutGrid size={14} className="mr-1 inline" />Organiser</button>
        <button className={bar} title="Palette de couleurs" onClick={() => setPaletteOpen(!paletteOpen)}><PaletteIcon size={14} className="mr-1 inline" />Palette</button>
        <button className={bar} title="Tout afficher (F)" onClick={() => fitTo(items)}><Expand size={14} className="mr-1 inline" />Ajuster</button>
        <button className={bar} title="Fond : points, grille ou uni" onClick={() => setPattern(PATTERNS[(PATTERNS.findIndex((p) => p.id === pattern) + 1) % PATTERNS.length].id)}>{PATTERNS.find((p) => p.id === pattern)?.label}</button>
        <button className={bar} title="Toujours au premier plan" onClick={() => void toggleOnTop()}>{onTop ? <PinOff size={14} /> : <Pin size={14} />}</button>
        {BACKGROUNDS.map((b) => (
          <button key={b} title={b === 'theme' ? 'Fond de l’application' : 'Couleur de fond'} onClick={() => setBg(b)} className="h-5 w-5 rounded-full" style={{ ...swatch(b), border: bg === b ? '2px solid #4da3ff' : '1px solid var(--border)' }} />
        ))}
      </div>
      )}
      <input ref={colorInput} type="color" className="hidden" onChange={(e) => { const c = viewCenter(); const s = makeSwatch({ x: c.x - 60, y: c.y - 60 }, e.target.value); commitItems([...itemsRef.current, s]); setSelection(new Set([s.id])) }} />
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(Array.from(e.target.files ?? []), viewCenter()); e.target.value = '' }} />

      {linkInput !== null && (
        <div data-ui className="absolute left-3 top-14 flex gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 shadow-md">
          <input
            autoFocus
            value={linkInput}
            placeholder="https://…"
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setLinkInput(null)
              if (e.key === 'Enter' && looksLikeUrl(linkInput)) {
                const c = viewCenter()
                const l = makeLink({ x: c.x - 130, y: c.y - 32 }, linkInput.trim())
                commitItems([...itemsRef.current, l]); setSelection(new Set([l.id])); setLinkInput(null)
              }
            }}
            className="w-72 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      )}

      {/* Zoom et message */}
      {!compact && (
      <div data-ui className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-[var(--fg)]">
        <button className={bar} onClick={() => setView((v) => zoomAt(v, 0.8, { x: size.w / 2, y: size.h / 2 }))}>−</button>
        <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)} %</span>
        <button className={bar} onClick={() => setView((v) => zoomAt(v, 1.25, { x: size.w / 2, y: size.h / 2 }))}>+</button>
        <button className={bar} onClick={() => setView((v) => zoomAt(v, 1 / v.zoom, { x: size.w / 2, y: size.h / 2 }))}>100 %</button>
        <button className={bar} disabled={hist.past.length === 0} onClick={doUndo} title="Annuler (Ctrl+Z)">↶</button>
        <button className={bar} disabled={hist.future.length === 0} onClick={doRedo} title="Rétablir (Ctrl+Y)">↷</button>
        <span>{items.length} élément{items.length > 1 ? 's' : ''}{hasSel ? ` · ${selection.size} sélectionné${selection.size > 1 ? 's' : ''}` : ''}</span>
      </div>
      )}
      {flash && <div data-ui className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-[var(--fg)] px-3 py-1.5 text-sm text-[var(--bg)] shadow-lg">{flash}</div>}

      {paletteOpen && !compact && (
        <div data-ui data-scroll className="absolute right-3 top-3 max-h-[80%] w-52 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-[var(--fg)] shadow-md">
          <div className="mb-2 text-xs font-semibold uppercase text-[var(--fg-muted)]">Palette {selected.some((i) => i.kind === 'image') ? 'de la sélection' : 'de la toile'}</div>
          {palette.length === 0 && <div className="text-sm text-[var(--fg-muted)]">Ajoute des images pour en extraire les couleurs.</div>}
          <div className="grid grid-cols-2 gap-2">
            {palette.map((c) => (
              <button key={c} title="Copier la couleur" onClick={() => void navigator.clipboard.writeText(c).then(() => say(`Couleur copiée : ${c}`))} className="overflow-hidden rounded border border-[var(--border)] text-left">
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
        </div>
      )}

      {/* Menu contextuel */}
      {menu && (
        <>
          <div data-ui className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div data-ui data-scroll className="absolute z-50 max-h-[70vh] w-60 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-[var(--fg)] shadow-xl" style={{ left: Math.min(menu.x, size.w - 250), top: Math.min(menu.y, Math.max(8, size.h - 400)) }}>
            {menu.mode === 'full' && !hasSel && (
              <>
                <MenuBtn label="Nouvelle note" onClick={() => addNote({ x: menu.world.x - 110, y: menu.world.y - 70 })} />
                <MenuBtn label="Tout sélectionner" hint="Ctrl+A" onClick={act.selectAll} />
                <MenuBtn label="Tout afficher" hint="F" onClick={() => fitTo(items)} />
                <MenuHead>Fond</MenuHead>
                <div className="flex gap-2 px-2 py-1">{BACKGROUNDS.map((b) => <button key={b} onClick={() => { setBg(b); setMenu(null) }} className="h-6 w-6 rounded-full border border-[var(--border)]" style={swatch(b)} />)}</div>
              </>
            )}
            {(hasSel || menu.mode === 'organize') && (
              <>
                {menu.mode === 'full' && (
                  <>
                    <MenuBtn label="Dupliquer" hint="Ctrl+D" onClick={act.duplicate} />
                    <MenuBtn label="Retourner (gauche-droite)" onClick={() => act.flip('x')} />
                    <MenuBtn label="Retourner (haut-bas)" onClick={() => act.flip('y')} />
                    <MenuBtn label="Mettre au premier plan" onClick={act.front} />
                    <MenuBtn label="Mettre à l'arrière-plan" onClick={act.back} />
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
