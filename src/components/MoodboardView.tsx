import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Expand, ImagePlus, LayoutGrid, Link2, Palette as PaletteIcon, Pin, PinOff, PictureInPicture2, Plus, StickyNote, Droplet, Type as TypeIcon, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Hand, MousePointer2 } from 'lucide-react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { samplePixels, processImage } from '@/lib/images'
import {
  alignItems, arrangeColumn, arrowHead, bringForward, centerOf, handlePoint, HANDLES, isCorner, itemBounds, resizeRotated, resizeScale, rotateItems, sendBackward, snapMove, snapRotation, arrangeFlow, arrangeGrid, arrangeRow, BACKGROUNDS, boundsOf, bringToFront, commit, duplicateItems,
  expandGroups, fitView, flipItems, groupItems, itemsInRect, looksLikeUrl, makeImage, makeLink, makeNote, makeShape, makeSwatch, makeText, moveItems,
  newHistory, newId, normalizeItems, normalizeRect, NOTE_COLORS, parseBoard, PATTERNS, redo, removeItems, scaleItems, screenToWorld, SHAPE_COLOR, SHAPES,
  sendToBack, serializeBoard, undo, ungroupItems, worldToScreen, zoomAt,
  type AlignMode, type Board, type Guide, type Handle, type BoardItem, type NormalizeMode, type Pattern, type Rect, type ShapeKind, type View,
} from '@/lib/moodboard'
import { extractPalette, mergePalettes, readableOn } from '@/lib/palette'
import { closeFloatingBoard, floatingBoardId, openFloatingBoard } from '@/lib/floating'
import { isTauri } from '@/lib/repo'
import { cssFont, FONTS, fitText, isPointText, measureTextBox, scaleTexts, textStyleOf, TEXT_PAD, type Measure } from '@/lib/boardText'
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

/** Couleurs proposées pour les formes et les textes. */
/** Le curseur de rotation (une flèche en arc), pour la zone juste à l'extérieur d'un coin du cadre de sélection. */
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 12a8 8 0 1 1-2.5-5.8'/%3E%3Cpath d='M20 3v5h-5'/%3E%3C/svg%3E") 12 12, crosshair`
const SHAPE_PALETTE = [SHAPE_COLOR, '#ff5c5c', '#ffd43b', '#51cf66', '#ffffff', '#111111']
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
  const [menu, setMenu] = useState<{ x: number; y: number; world: Pt; mode: 'full' | 'organize'; add?: boolean } | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palette, setPalette] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  // Outil actif : la flèche (sélection) ou le texte (touche T) ; et le texte en cours de frappe.
  const [tool, setTool] = useState<'select' | 'text' | 'hand'>('select')
  const [draft, setDraft] = useState('')
  // Les traits d'alignement montrés pendant un déplacement (guides intelligents).
  const [guides, setGuides] = useState<Guide[]>([])
  // Où poser ce qu'on ajoute depuis le menu « Ajouter » (le point du clic droit), pour les fenêtres de choix qui s'ouvrent ensuite.
  const fileAt = useRef<Pt | null>(null)
  const colorAt = useRef<Pt | null>(null)
  const linkAt = useRef<Pt | null>(null)
  const lastPt = useRef<Pt>({ x: 200, y: 200 })
  const [onTop, setOnTop] = useState(false)
  const isFloatingElsewhere = useApp((s) => s.floatingBoards.includes(board.id)) && !floatingBoardId()
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
      return ctx.measureText(text).width + st.ls * st.size * text.length
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

  const addShape = useCallback((at: Pt, kind: ShapeKind) => {
    const sh = makeShape(at, kind)
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
    if (info.site === 'instagram' && !cookies) { say("Pour Instagram, choisis d'abord ton fichier cookies dans les paramètres de la bibliothèque (Télécharger mes enregistrements)."); return }
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
    noteColor: (color: string) => withSelection((i, s) => i.map((it) => (s.has(it.id) && it.kind === 'note' ? { ...it, color } : it))),
    shapeColor: (color: string) => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && (it.kind === 'shape' || it.kind === 'text') ? { ...it, color } : it))),
    toggleFill: () => withSelection((i, s2) => i.map((it) => (s2.has(it.id) && it.kind === 'shape' ? { ...it, filled: !it.filled } : it))),
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
      if (e.key === 'Escape') (e.target as HTMLElement).blur()
      return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    let handled = true
    if (e.key === ' ') setSpaceDown(true)
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
    else if (!mod && key === 't') setTool('text')
    else if (!mod && key === 'h') setTool('hand')
    else if (!mod && key === 'v') setTool('select')
    else if (e.key === 'Escape') { setSelection(new Set()); setMenu(null); setEditing(null); setTool('select') }
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
  const renderItem = (it: BoardItem) => {
    const isSel = selection.has(it.id)
    const base: React.CSSProperties = {
      position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h,
      outline: isSel ? `${2 / zoom}px solid #4da3ff` : undefined, outlineOffset: 0,
      transform: it.rot ? `rotate(${it.rot}deg)` : undefined, transformOrigin: 'center',
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
      const point = isPointText(it)
      const common: React.CSSProperties = {
        fontFamily: `"${st.font}", sans-serif`, fontSize: st.size, fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal',
        lineHeight: st.lh, letterSpacing: `${st.ls}em`, textAlign: it.align ?? 'left', color: it.color ?? textColor, padding: TEXT_PAD, margin: 0,
        whiteSpace: point ? 'pre' : 'pre-wrap', overflowWrap: point ? 'normal' : 'anywhere', boxSizing: 'border-box', width: '100%', height: '100%',
      }
      if (editing === it.id) {
        // En tapant, la boîte suit le texte : un texte de point s'allonge, une zone de texte grandit vers le bas.
        const box = measureTextBox({ ...it, text: draft }, measureFor(it))
        return (
          <div key={it.id} data-item={it.id} style={{ ...base, width: box.w, height: box.h, outline: `${1.5 / zoom}px dashed #4da3ff` }}>
            <textarea
              autoFocus
              value={draft}
              wrap={point ? 'off' : 'soft'}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              onBlur={() => finishText(it.id, draft)}
              style={{ ...common, resize: 'none', border: 0, outline: 0, background: 'transparent', overflow: 'hidden', display: 'block' }}
            />
          </div>
        )
      }
      return (
        <div key={it.id} data-item={it.id} style={base}>
          <div style={{ ...common, pointerEvents: 'none', overflow: 'visible' }}>{it.text || <span style={{ opacity: 0.4 }}>Texte…</span>}</div>
        </div>
      )
    }
    if (it.kind === 'shape') {
      const sw = it.sw ?? 4
      const color = it.color ?? SHAPE_COLOR
      const fill = it.filled ? color : 'none'
      const w = Math.max(2, it.w)
      const h = Math.max(2, it.h)
      const head = it.shape === 'arrow' ? arrowHead(sw, sw, w - sw, h - sw, Math.max(14, sw * 4)) : null
      return (
        <div key={it.id} data-item={it.id} style={base}>
          <svg width={w} height={h} style={{ display: 'block', overflow: 'visible', pointerEvents: 'none', transform: `scale(${it.flipX ? -1 : 1}, ${it.flipY ? -1 : 1})` }}>
            {it.shape === 'ellipse' ? (
              <ellipse cx={w / 2} cy={h / 2} rx={Math.max(1, (w - sw) / 2)} ry={Math.max(1, (h - sw) / 2)} fill={fill} stroke={color} strokeWidth={sw} />
            ) : it.shape === 'line' || it.shape === 'arrow' ? (
              <>
                <line x1={sw} y1={sw} x2={w - sw} y2={h - sw} stroke={color} strokeWidth={sw} strokeLinecap="round" />
                {head && <polygon points={head.map((pt) => pt.join(',')).join(' ')} fill={color} stroke={color} strokeWidth={sw / 2} strokeLinejoin="round" />}
              </>
            ) : (
              <rect x={sw / 2} y={sw / 2} width={Math.max(1, w - sw)} height={Math.max(1, h - sw)} rx={6} fill={fill} stroke={color} strokeWidth={sw} />
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
  const selShapes = selected.some((i) => i.kind === 'shape')
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
      style={{ backgroundColor: bgColor, ...patternStyle, cursor: panning ? 'grabbing' : spaceDown || tool === 'hand' ? 'grab' : tool === 'text' ? 'text' : 'default', touchAction: 'none' }}
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
        {frame && !marquee && !editing && (
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
      <div data-ui className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        <button className={bar} title="Ajouter des images" onClick={() => fileInput.current?.click()}><ImagePlus size={14} className="mr-1 inline" />Images</button>
        <button className={bar} title="Nouvelle note" onClick={() => { const c = viewCenter(); addNote({ x: c.x - 110, y: c.y - 70 }) }}><StickyNote size={14} className="mr-1 inline" />Note</button>
        <button className={bar} title="Nouvelle couleur" onClick={() => colorInput.current?.click()}><Droplet size={14} className="mr-1 inline" />Couleur</button>
        <button className={bar} title="Nouveau lien (un lien Pinterest ou Instagram ajoute ses images)" onClick={() => setLinkInput(linkInput === null ? '' : null)}><Link2 size={14} className="mr-1 inline" />Lien</button>
        <button className={bar} title="Organiser la sélection" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const c = containerRef.current!.getBoundingClientRect(); setMenu({ x: r.left - c.left, y: r.bottom - c.top + 4, world: viewCenter(), mode: 'organize' }) }}><LayoutGrid size={14} className="mr-1 inline" />Organiser</button>
        <button className={bar} title="Palette de couleurs" onClick={() => setPaletteOpen(!paletteOpen)}><PaletteIcon size={14} className="mr-1 inline" />Palette</button>
        <button className={bar} title="Tout afficher (F)" onClick={() => fitTo(items)}><Expand size={14} className="mr-1 inline" />Ajuster</button>
        <button className={bar} title="Fond : petits points ou uni" onClick={() => setPattern(PATTERNS[(PATTERNS.findIndex((p) => p.id === pattern) + 1) % PATTERNS.length].id)}>{PATTERNS.find((p) => p.id === pattern)?.label}</button>
        <button className={bar} title="Ouvrir dans une petite fenêtre flottante, toujours devant (comme PureRef)" onClick={() => void openFloatingBoard(board.id, board.title).then((ok) => { if (!ok) say('La fenêtre flottante n’existe que dans l’application Windows.') })}><PictureInPicture2 size={14} className="mr-1 inline" />Flottant</button>
        <button className={bar} title="Toujours au premier plan" onClick={() => void toggleOnTop()}>{onTop ? <PinOff size={14} /> : <Pin size={14} />}</button>
        {BACKGROUNDS.map((b) => (
          <button key={b} title={b === '#ffffff' ? 'Fond blanc' : 'Fond noir'} aria-label={b === '#ffffff' ? 'Fond blanc' : 'Fond noir'} aria-pressed={isDark === (b !== '#ffffff')} onClick={() => setBg(b)} className="h-5 w-5 rounded-full" style={{ ...swatch(b), border: isDark === (b !== '#ffffff') ? '2px solid #4da3ff' : '1px solid var(--border)' }} />
        ))}
      </div>
      )}
      <input ref={colorInput} type="color" className="hidden" onChange={(e) => { const c = colorAt.current ?? viewCenter(); colorAt.current = null; const s = makeSwatch({ x: c.x - 60, y: c.y - 60 }, e.target.value); commitItems([...itemsRef.current, s]); setSelection(new Set([s.id])) }} />
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const at = fileAt.current ?? viewCenter(); fileAt.current = null; void addFiles(Array.from(e.target.files ?? []), at); e.target.value = '' }} />

      {linkInput !== null && (
        <div data-ui className="absolute left-14 top-14 flex max-w-[24rem] flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 shadow-md">
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
            className="w-72 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          <p className="text-xs text-[var(--fg-muted)]">Un lien de <b>tableau ou d'épingle Pinterest</b>, ou de <b>post Instagram</b>, télécharge ses images et les pose sur la toile (au plus {IMPORT_LIMIT}). Un autre lien devient une carte.</p>
        </div>
      )}

      {importing && (
        <div data-ui className="absolute left-14 top-14 z-40 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] shadow-md">
          Téléchargement en cours…
          <button className={bar} onClick={() => void invoke('saver_stop')}>Arrêter</button>
        </div>
      )}

      {showTextPanel && (() => {
        const first = textSel[0]
        const st = textStyleOf(first)
        const field = 'rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs text-[var(--fg)] outline-none focus:border-[var(--accent)]'
        const toggle = (on: boolean) => bar + ' flex h-7 w-7 items-center justify-center !px-0' + (on ? ' !border-[var(--accent)] !text-[var(--accent)]' : '')
        const row = 'flex items-center gap-2'
        const label = 'w-20 shrink-0 text-[var(--fg-muted)]'
        return (
          <div data-ui className="absolute bottom-3 right-3 z-40 flex w-56 flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--fg)] shadow-md">
            <div className="text-[11px] font-semibold uppercase text-[var(--fg-muted)]">Texte{textSel.length > 1 ? ` (${textSel.length})` : ''}</div>
            <select className={field + ' w-full'} value={st.font} onChange={(e) => setTextProps({ font: e.target.value })} aria-label="Police">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className={row}>
              <span className={label}>Taille</span>
              <input className={field + ' w-16'} type="number" min={6} max={600} value={Math.round(st.size)} onChange={(e) => setTextProps({ size: Math.min(600, Math.max(6, Number(e.target.value) || 6)) })} aria-label="Taille des lettres" />
              <button className={toggle(st.bold)} onClick={() => setTextProps({ bold: !st.bold })} title="Gras" aria-pressed={st.bold}><Bold size={13} /></button>
              <button className={toggle(st.italic)} onClick={() => setTextProps({ italic: !st.italic })} title="Italique" aria-pressed={st.italic}><Italic size={13} /></button>
            </div>
            <div className={row}>
              <span className={label}>Alignement</span>
              <button className={toggle((first.align ?? 'left') === 'left')} onClick={() => setTextProps({ align: 'left' })} title="Aligné à gauche"><AlignLeft size={13} /></button>
              <button className={toggle(first.align === 'center')} onClick={() => setTextProps({ align: 'center' })} title="Centré"><AlignCenter size={13} /></button>
              <button className={toggle(first.align === 'right')} onClick={() => setTextProps({ align: 'right' })} title="Aligné à droite"><AlignRight size={13} /></button>
            </div>
            <div className={row}>
              <span className={label}>Couleur</span>
              <input type="color" className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0" value={/^#[0-9a-f]{6}$/i.test(first.color ?? '') ? (first.color as string) : isDark ? '#ffffff' : '#111111'} onChange={(e) => setTextProps({ color: e.target.value })} aria-label="Couleur du texte" />
            </div>
            <div className={row}>
              <span className={label}>Interlignage</span>
              <input className={field + ' w-16'} type="number" step={0.1} min={0.6} max={3} value={st.lh} onChange={(e) => setTextProps({ lh: Math.min(3, Math.max(0.6, Number(e.target.value) || 1.2)) })} aria-label="Interlignage" />
            </div>
            <div className={row}>
              <span className={label}>Espacement</span>
              <input className={field + ' w-16'} type="number" step={0.01} min={-0.2} max={1} value={st.ls} onChange={(e) => setTextProps({ ls: Math.min(1, Math.max(-0.2, Number(e.target.value) || 0)) })} aria-label="Espacement des lettres" />
            </div>
          </div>
        )
      })()}

      {!compact && (
        <div data-ui className="absolute left-3 top-14 z-30 flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-sm">
          {([['select', MousePointer2, 'Sélection (V)'], ['text', TypeIcon, 'Texte (T) : un clic pour un texte, glisser pour une zone de texte'], ['hand', Hand, 'Main (H ou Espace) : déplacer la toile']] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={'flex h-8 w-8 items-center justify-center rounded ' + (tool === id ? 'bg-[var(--accent)] text-white' : 'text-[var(--fg)] hover:bg-[var(--bg-hover)]')}
            >
              <Icon size={16} />
            </button>
          ))}
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
      {isFloatingElsewhere && (
        <div data-ui className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--bg)]/95 p-6 text-center">
          <PictureInPicture2 size={28} className="text-[var(--fg-muted)]" />
          <p className="text-sm">Ce moodboard est ouvert dans une fenêtre flottante.<br /><span className="text-[var(--fg-muted)]">Pour éviter d’écraser tes modifications, on ne le modifie pas ici en même temps.</span></p>
          <button className={bar} onClick={() => void closeFloatingBoard(board.id).then(() => useApp.getState().setFloatingBoard(board.id, false))}>Fermer la fenêtre flottante et reprendre ici</button>
        </div>
      )}
      {flash && <div data-ui className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-[var(--fg)] px-3 py-1.5 text-sm text-[var(--bg)] shadow-lg">{flash}</div>}

      {paletteOpen && !compact && (
        <div data-ui data-scroll style={{ top: 12, maxHeight: showTextPanel ? 'calc(100% - 350px)' : '80%' }} className="absolute right-3 w-52 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-[var(--fg)] shadow-md">
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
          <div data-ui data-scroll className="absolute z-50 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-[var(--fg)] shadow-xl" style={{ left: Math.max(0, Math.min(menu.x, size.w - 290)), top: Math.min(menu.y, Math.max(8, size.h - 400)) }}>
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
                    <MenuBtn label="Avancer d'un cran" hint="Ctrl+]" onClick={act.forward} />
                    <MenuBtn label="Reculer d'un cran" hint="Ctrl+[" onClick={act.backward} />
                    <MenuBtn label="Mettre au premier plan" hint="Ctrl+Maj+]" onClick={act.front} />
                    <MenuBtn label="Mettre à l'arrière-plan" hint="Ctrl+Maj+[" onClick={act.back} />
                    {selection.size > 1 && !selGrouped && <MenuBtn label="Grouper" hint="Ctrl+G" onClick={act.group} />}
                    {selGrouped && <MenuBtn label="Dissocier" hint="Ctrl+Maj+G" onClick={act.ungroup} />}
                    {selShapes && (
                      <>
                        <MenuHead>Couleur de la forme</MenuHead>
                        <div className="flex gap-2 px-2 py-1">{SHAPE_PALETTE.map((c) => <button key={c} onClick={() => { act.shapeColor(c); setMenu(null) }} className="h-6 w-6 rounded-full border border-[var(--border)]" style={{ background: c }} />)}</div>
                        {selShapes && (
                          <>
                            <MenuBtn label="Remplie / contour seulement" onClick={act.toggleFill} />
                            <MenuBtn label="Trait plus épais" onClick={() => act.stroke(2)} />
                            <MenuBtn label="Trait plus fin" onClick={() => act.stroke(-2)} />
                          </>
                        )}
                      </>
                    )}
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
