import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dices, Equal, Expand, ExternalLink, Map as MapIcon, Palette, RefreshCw, Shapes, X } from 'lucide-react'
import { loadColorIndex, paletteDistance, type ColorIndex } from '@/biblio/lib/colors.ts'
import { computeMap, loadMap, type MapData } from '@/biblio/lib/mapData.ts'
import { kmeans2d, labelClusters, mulberry32, nearestByVector } from '@/biblio/lib/mapLayout.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { boundsOf, clampZoom, fitView, zoomAt, type View } from '@/biblio/lib/viewMath.ts'
import { pickStep, STEP_LABELS, type StepKind } from '@/biblio/lib/voyage.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useMapRequest } from '@/biblio/store/map.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { BlockMenu } from './BlockMenu.tsx'

/** L'icône de chacune des quatre façons de continuer le voyage sur la carte. */
const STEP_ICONS: Record<StepKind, typeof Equal> = { same: Equal, different: Shapes, colors: Palette, surprise: Dices }

/** Les images qui apparaissent autour de celle qu'on regarde. */
const AROUND = 12
/** Largeur du panneau de droite (pour cadrer la carte dans la place qui reste). */
const PANEL_W = 300
/** Taille (en pixels) à partir de laquelle on charge l'image en grand plutôt que la petite version. */
const BIG_TILE = 110

interface Pts {
  ids: string[]
  x: Float32Array
  y: Float32Array
  /** Numéro de chaque point dans la carte enregistrée (pour retrouver son empreinte). */
  vec: Int32Array
  /** Ordre d'apparition (mélangé une fois pour toutes : la même image représente toujours sa zone). */
  order: Int32Array
  index: Map<string, number>
  cluster: Int32Array
  centers: Float32Array
  names: string[]
}

interface Drawn {
  i: number
  x: number
  y: number
  w: number
  h: number
}

type Drag = { type: 'pan'; sx: number; sy: number; view: View; moved: boolean }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Un lot de points prêts à dessiner, à partir de la carte enregistrée et des blocs qui existent encore. */
function buildPoints(data: MapData, known: ReadonlySet<string>, labelsOfBlock: (id: string) => string[]): Pts {
  const keep: number[] = []
  data.ids.forEach((id, j) => {
    if (known.has(id)) keep.push(j)
  })
  const n = keep.length
  const ids = keep.map((j) => data.ids[j])
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const vec = Int32Array.from(keep)
  keep.forEach((j, i) => {
    x[i] = data.xy[2 * j]
    y[i] = data.xy[2 * j + 1]
  })
  const rand = mulberry32(11)
  const order = Int32Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  const xy = new Float32Array(2 * n)
  for (let i = 0; i < n; i++) {
    xy[2 * i] = x[i]
    xy[2 * i + 1] = y[i]
  }
  const k = Math.max(1, Math.min(18, Math.round(Math.sqrt(n) / 6)))
  const { centers, assign } = kmeans2d(xy, n, k, mulberry32(5))
  const names = labelClusters(assign, k, (i) => labelsOfBlock(ids[i]))
  return { ids, x, y, vec, order, index: new Map(ids.map((id, i) => [id, i])), cluster: assign, centers, names }
}

/** La page « Carte » : toutes les images placées selon leur ressemblance ; on zoome, on clique pour voir ce qui est autour, on garde le chemin parcouru. */
export function MapView() {
  const blocks = useGrid((s) => s.blocks)
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const typeIndex = useGrid((s) => s.typeIndex)
  const request = useMapRequest((s) => s.request)
  const requested = useMapRequest((s) => s.blockId)

  const [data, setData] = useState<MapData | null>(null)
  const [status, setStatus] = useState<'loading' | 'computing' | 'ready' | 'noai'>('loading')
  const [progress, setProgress] = useState({ phase: '', fraction: 0 })
  const [focus, setFocus] = useState<string | null>(null)
  const [around, setAround] = useState<string[]>([])
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  /** Le chemin parcouru pendant le voyage (les images regardées, dans l'ordre). */
  const [trail, setTrail] = useState<string[]>([])
  const colorsRef = useRef<ColorIndex | null>(null)

  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, zoom: 0.2 })
  const sizeRef = useRef({ w: 800, h: 600 })
  const dirty = useRef(true)
  const dragRef = useRef<Drag | null>(null)
  const hoverRef = useRef<string | null>(null)
  const drawn = useRef<Drawn[]>([])
  const fitNext = useRef(true)
  const anim = useRef<{ from: View; to: View; t0: number } | null>(null)
  const pending = useRef<string | null>(null)
  const small = useRef(new Map<string, ImageBitmap | 'loading' | 'fail'>())
  const large = useRef(new Map<string, HTMLImageElement>())
  const inflight = useRef(0)

  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])
  const byIdRef = useRef(byId)
  byIdRef.current = byId

  // Les types de chaque bloc : ils servent à nommer les îlots.
  const typesOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const t of typeIndex.types) for (const id of typeIndex.index.get(t.id) ?? []) m.set(id, [...(m.get(id) ?? []), t.name])
    return m
  }, [typeIndex])

  const pts = useMemo(() => (data ? buildPoints(data, new Set(byId.keys()), (id) => typesOf.get(id) ?? []) : null), [data, byId, typesOf])
  const ptsRef = useRef(pts)
  ptsRef.current = pts
  const focusRef = useRef(focus)
  focusRef.current = focus
  const aroundRef = useRef(around)
  aroundRef.current = around
  const trailRef = useRef(trail)
  trailRef.current = trail
  useEffect(() => {
    dirty.current = true
  }, [focus, around, pts, trail])

  // ── Chargement de la carte (ou calcul la première fois) ──
  const compute = useCallback(async () => {
    setStatus('computing')
    setProgress({ phase: 'Lecture des empreintes', fraction: 0 })
    try {
      const d = await computeMap((phase, fraction) => setProgress({ phase, fraction }))
      if (d.ids.length === 0) {
        setStatus('noai')
        return
      }
      fitNext.current = true
      setData(d)
      setStatus('ready')
    } catch (err) {
      useToast.getState().show(err instanceof Error ? err.message : 'Le calcul de la carte a échoué.')
      setStatus('loading')
    }
  }, [])

  const started = useRef(false)
  useEffect(() => {
    if (blocks.length === 0 || started.current) return
    started.current = true
    void (async () => {
      const d = await loadMap()
      if (d) {
        fitNext.current = true
        setData(d)
        setStatus('ready')
      } else await compute()
    })()
  }, [blocks.length, compute])

  /** Cadre un ensemble de points dans la place disponible (la carte moins le panneau). */
  const viewFor = useCallback((idxs: number[], padding: number, maxZoom: number, withPanel: boolean): View | null => {
    const P = ptsRef.current
    if (!P || idxs.length === 0) return null
    const { w, h } = sizeRef.current
    const rect = boundsOf(idxs.map((i) => ({ x: P.x[i] - 20, y: P.y[i] - 20, w: 40, h: 40 })))
    const room = { w: Math.max(200, w - (withPanel ? PANEL_W + 24 : 0)), h: Math.max(200, h) }
    return fitView(rect, room, padding, maxZoom)
  }, [])

  const flyTo = useCallback((to: View | null, instant = false) => {
    if (!to) return
    if (instant) {
      viewRef.current = to
      anim.current = null
    } else anim.current = { from: viewRef.current, to, t0: performance.now() }
    dirty.current = true
  }, [])

  /** Applique le cadrage de départ (toute la carte) dès que la zone a une taille. */
  const applyPendingFit = () => {
    const P = ptsRef.current
    const { w, h } = sizeRef.current
    if (!fitNext.current || !P || P.ids.length === 0 || w < 100 || h < 100) return
    fitNext.current = false
    const all = Array.from({ length: P.ids.length }, (_, i) => i)
    flyTo(viewFor(all, 40, 2, false), true)
    if (pending.current) {
      const id = pending.current
      pending.current = null
      focusOn(id)
    }
  }
  const applyPendingFitRef = useRef(applyPendingFit)
  applyPendingFitRef.current = applyPendingFit
  useEffect(() => {
    applyPendingFitRef.current()
  }, [pts])

  /** Met une image au centre de l'attention : on affiche ce qu'il y a autour, et la carte s'y déplace. */
  /** Les images les plus proches par le contenu (numéros de points), de la plus proche à la plus lointaine. */
  const rankedFor = (i: number, k: number) => {
    const P = ptsRef.current!
    const d = data!
    const byVec = new Map<number, number>()
    P.vec.forEach((v, idx) => byVec.set(v, idx))
    const out: { index: number; score: number }[] = []
    for (const h of nearestByVector(d.vectors, d.dim, d.ids.length, P.vec[i], k * 2)) {
      const idx = byVec.get(h.index)
      if (idx !== undefined) out.push({ index: idx, score: h.score })
      if (out.length >= k) break
    }
    return out
  }

  /** Met une image au centre de l'attention : on affiche ce qu'il y a autour, et la carte s'y déplace. `record` : on l'ajoute au chemin. */
  const focusOn = (id: string, fly = true, record = true) => {
    const P = ptsRef.current
    if (!P || !data) return
    const i = P.index.get(id)
    if (i === undefined) {
      useToast.getState().show("Cette image n'est pas encore sur la carte.")
      return
    }
    const list = rankedFor(i, AROUND).map((h) => h.index)
    setFocus(id)
    setAround(list.map((j) => P.ids[j]))
    if (record) setTrail((t) => (t[t.length - 1] === id ? t : [...t, id].slice(-200)))
    if (fly) flyTo(viewFor([i, ...list], 120, 3, true))
  }

  /** Un saut du voyage : « plus pareil », « un peu différent », « mêmes couleurs » ou « surprends-moi ». */
  const step = async (kind: StepKind) => {
    const P = ptsRef.current
    const from = focusRef.current ? P?.index.get(focusRef.current) : undefined
    if (!P || from === undefined) return
    if (kind === 'colors' && !colorsRef.current) colorsRef.current = await loadColorIndex()
    const colors = colorsRef.current
    const mine = colors?.get(P.ids[from])
    const visited = new Set(trailRef.current.map((id) => P.index.get(id)).filter((v): v is number => v !== undefined))
    visited.add(from)
    const far: number[] = []
    if (kind === 'surprise') {
      for (let t = 0; t < 400 && far.length < 40; t++) {
        const j = Math.floor(Math.random() * P.ids.length)
        if (P.cluster[j] !== P.cluster[from]) far.push(j)
      }
    }
    const next = pickStep(kind, rankedFor(from, 80), visited, {
      far,
      colorDistance: mine && colors ? (j) => paletteDistance(mine, colors.get(P.ids[j]) ?? []) : undefined,
    })
    if (next === null) {
      useToast.getState().show(kind === 'colors' ? "Je ne trouve pas de voisine aux couleurs proches." : 'Plus rien à proposer par ici : essaie un autre saut.')
      return
    }
    focusOn(P.ids[next])
  }

  const focusOnRef = useRef(focusOn)
  focusOnRef.current = focusOn

  // Une demande venue d'ailleurs (« Voir sur la carte »).
  useEffect(() => {
    if (request === 0 || !requested) return
    if (ptsRef.current && !fitNext.current) focusOnRef.current(requested)
    else pending.current = requested
  }, [request, requested])
  useEffect(() => {
    if (pts && pending.current && !fitNext.current) {
      const id = pending.current
      pending.current = null
      focusOnRef.current(id)
    }
  }, [pts])

  // ── Images : petites versions (légères) de loin, grandes de près ──
  const tileImage = useCallback(
    (id: string, px: number): CanvasImageSource | null => {
      const b = byIdRef.current.get(id)
      if (!b?.thumb || !thumbsDir) return null
      const url = fileUrl(thumbPath(thumbsDir, b.thumb))
      if (px > BIG_TILE) {
        const cache = large.current
        let img = cache.get(url)
        if (img) {
          cache.delete(url)
          cache.set(url, img)
        } else if (inflight.current < 16) {
          img = new Image()
          inflight.current++
          img.onload = img.onerror = () => {
            inflight.current--
            dirty.current = true
          }
          img.src = url
          cache.set(url, img)
          if (cache.size > 160) {
            const oldest = cache.keys().next().value as string
            cache.delete(oldest)
          }
        }
        if (img?.complete && img.naturalWidth > 0) return img
      }
      const cache = small.current
      const got = cache.get(url)
      if (got && got !== 'loading' && got !== 'fail') {
        cache.delete(url)
        cache.set(url, got)
        return got
      }
      if (!got && inflight.current < 16) {
        cache.set(url, 'loading')
        inflight.current++
        void fetch(url)
          .then((r) => r.blob())
          .then((blob) => createImageBitmap(blob, { resizeWidth: 128, resizeQuality: 'medium' }))
          .then((bmp) => {
            cache.set(url, bmp)
            if (cache.size > 1600) {
              const oldest = cache.keys().next().value as string
              const v = cache.get(oldest)
              if (v && v !== 'loading' && v !== 'fail') v.close()
              cache.delete(oldest)
            }
          })
          .catch(() => cache.set(url, 'fail'))
          .finally(() => {
            inflight.current--
            dirty.current = true
          })
      }
      return null
    },
    [thumbsDir],
  )

  // ── Dessin ──
  const draw = useCallback(() => {
    const cv = canvas.current
    const c = cv?.getContext('2d')
    const P = ptsRef.current
    if (!cv || !c) return
    const { w, h } = sizeRef.current
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, w, h)
    drawn.current = []
    if (!P) return
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const view = viewRef.current
    const z = view.zoom
    // Plus on zoome, plus les images grandissent (mais moins vite que la carte) et plus on en voit.
    const cell = z <= 1 ? 30 : 30 * Math.pow(z, 0.8)
    const cellWorld = cell / z
    const tile = cell * 0.92
    const sx = (i: number) => P.x[i] * z + view.x
    const sy = (i: number) => P.y[i] * z + view.y
    const dims = (i: number) => {
      const r = Math.min(2.2, Math.max(0.45, byIdRef.current.get(P.ids[i])?.ratio ?? 1))
      return r >= 1 ? { w: tile, h: tile / r } : { w: tile * r, h: tile }
    }

    const focusId = focusRef.current
    const focusIdx = focusId ? P.index.get(focusId) : undefined
    const aroundIdx = aroundRef.current.map((id) => P.index.get(id)).filter((v): v is number => v !== undefined)
    const aroundSet = new Set(aroundIdx)
    const hoverIdx = hoverRef.current ? P.index.get(hoverRef.current) : undefined
    const forced = new Set<number>(aroundIdx)
    if (focusIdx !== undefined) forced.add(focusIdx)
    if (hoverIdx !== undefined) forced.add(hoverIdx)

    const key = (i: number) => Math.floor(P.x[i] / cellWorld) * 100003 + Math.floor(P.y[i] / cellWorld)
    const occupied = new Set<number>()
    for (const i of forced) occupied.add(key(i))
    const shown: number[] = []
    const margin = tile
    for (let o = 0; o < P.order.length; o++) {
      const i = P.order[o]
      const x = sx(i)
      const y = sy(i)
      if (x < -margin || y < -margin || x > w + margin || y > h + margin) continue
      if (forced.has(i)) continue
      const k = key(i)
      if (occupied.has(k)) continue
      occupied.add(k)
      shown.push(i)
    }
    const dim = focusId !== null
    const paint = (i: number, alpha: number) => {
      const x = sx(i)
      const y = sy(i)
      if (x < -margin || y < -margin || x > w + margin || y > h + margin) return
      const d = dims(i)
      const img = tileImage(P.ids[i], Math.max(d.w, d.h))
      c.globalAlpha = alpha
      if (img) c.drawImage(img, x - d.w / 2, y - d.h / 2, d.w, d.h)
      else {
        c.fillStyle = dark ? '#3a3a38' : '#dcdcd8'
        c.fillRect(x - d.w / 2, y - d.h / 2, d.w, d.h)
      }
      c.globalAlpha = 1
      drawn.current.push({ i, x, y, w: d.w, h: d.h })
    }
    for (const i of shown) paint(i, dim ? 0.3 : 1)

    // lignes entre l'image regardée et ses voisines
    if (focusIdx !== undefined) {
      c.strokeStyle = '#f0a31a'
      c.globalAlpha = 0.55
      c.lineWidth = 1.2
      for (const j of aroundIdx) {
        c.beginPath()
        c.moveTo(sx(focusIdx), sy(focusIdx))
        c.lineTo(sx(j), sy(j))
        c.stroke()
      }
      c.globalAlpha = 1
    }
    for (const i of forced) {
      if (i === focusIdx) continue
      paint(i, 1)
    }
    if (focusIdx !== undefined) paint(focusIdx, 1)

    // contours : voisines en orange, image regardée en noir
    const ring = (i: number, color: string, width: number) => {
      const d = drawn.current.find((r) => r.i === i)
      if (!d) return
      c.strokeStyle = color
      c.lineWidth = width
      c.strokeRect(d.x - d.w / 2 - width / 2, d.y - d.h / 2 - width / 2, d.w + width, d.h + width)
    }
    for (const i of aroundSet) ring(i, '#f0a31a', 2)
    if (focusIdx !== undefined) ring(focusIdx, dark ? '#ffffff' : '#111111', 3)
    if (hoverIdx !== undefined && hoverIdx !== focusIdx) ring(hoverIdx, '#f0a31a', 2.5)

    // le nom des îlots, quand on voit la carte de loin
    const fade = Math.max(0, Math.min(1, (1.4 - z) / 0.5))
    if (fade > 0) {
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = '600 17px system-ui, sans-serif'
      c.lineJoin = 'round'
      c.lineWidth = 5
      c.globalAlpha = fade
      P.names.forEach((name, k) => {
        if (!name) return
        const x = P.centers[2 * k] * z + view.x
        const y = P.centers[2 * k + 1] * z + view.y
        if (x < -100 || y < -40 || x > w + 100 || y > h + 40) return
        c.strokeStyle = dark ? 'rgba(20,20,20,.85)' : 'rgba(255,255,255,.9)'
        c.strokeText(name, x, y)
        c.fillStyle = dark ? '#f3f3f1' : '#1c1c1a'
        c.fillText(name, x, y)
      })
      c.globalAlpha = 1
    }
  }, [tileImage])

  // ── Boucle d'animation ──
  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      const a = anim.current
      if (a) {
        const t = Math.min(1, (now - a.t0) / 550)
        const e = ease(t)
        viewRef.current = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e, zoom: a.from.zoom * Math.pow(a.to.zoom / a.from.zoom, e) }
        if (t >= 1) anim.current = null
        dirty.current = true
      }
      if (dirty.current) {
        dirty.current = false
        draw()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  // ── Taille de la zone ──
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
      dirty.current = true
      applyPendingFitRef.current()
    })
    ro.observe(el)
    sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
    return () => ro.disconnect()
  }, [])

  // Libère les images gardées en mémoire quand la page disparaît.
  useEffect(() => {
    const s = small.current
    return () => {
      for (const v of s.values()) if (v !== 'loading' && v !== 'fail') v.close()
      s.clear()
    }
  }, [])

  // ── Zoom à la molette ──
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      anim.current = null
      if (hoverRef.current) {
        hoverRef.current = null
        setHover(null)
      }
      const r = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      viewRef.current = zoomAt(viewRef.current, factor, { x: e.clientX - r.left, y: e.clientY - r.top })
      viewRef.current = { ...viewRef.current, zoom: clampZoom(viewRef.current.zoom) }
      dirty.current = true
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Pointeur ──
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const tileAt = (p: { x: number; y: number }): Drawn | undefined => {
    const list = drawn.current
    for (let k = list.length - 1; k >= 0; k--) {
      const d = list[k]
      if (Math.abs(p.x - d.x) <= d.w / 2 && Math.abs(p.y - d.y) <= d.h / 2) return d
    }
    return undefined
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    setMenu(null)
    anim.current = null
    const p = local(e)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* le pointeur n'est plus actif : on continue sans le capturer */
    }
        dragRef.current = { type: 'pan', sx: p.x, sy: p.y, view: viewRef.current, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e)
    const d = dragRef.current
    if (d?.type === 'pan') {
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 3) d.moved = true
      viewRef.current = { ...d.view, x: d.view.x + p.x - d.sx, y: d.view.y + p.y - d.sy }
      dirty.current = true
      return
    }
    const t = tileAt(p)
    const id = t ? ptsRef.current!.ids[t.i] : null
    if (id !== hoverRef.current) {
      hoverRef.current = id
      dirty.current = true
      setHover(id ? { id, x: p.x, y: p.y } : null)
    } else if (id) setHover({ id, x: p.x, y: p.y })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* déjà relâché */
    }
    const P = ptsRef.current
    if (!P || !d) return
    if (d.type === 'pan' && !d.moved) {
      const t = tileAt(local(e))
      if (t) focusOn(P.ids[t.i])
      else if (focusRef.current) {
        setFocus(null)
        setAround([])
      }
    }
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const t = tileAt(local(e))
    if (t) useGrid.getState().open(ptsRef.current!.ids[t.i])
  }

  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const t = tileAt(local(e))
    if (t) setMenu({ x: e.clientX, y: e.clientY, ids: [ptsRef.current!.ids[t.i]] })
  }

  const fitAll = () => {
    const P = ptsRef.current
    if (!P) return
    flyTo(viewFor(Array.from({ length: P.ids.length }, (_, i) => i), 40, 2, false))
    setFocus(null)
    setAround([])
  }


  const focusBlock = focus ? byId.get(focus) : undefined
  const thumbOf = (id: string) => {
    const b = byId.get(id)
    return b?.thumb && thumbsDir ? fileUrl(thumbPath(thumbsDir, b.thumb)) : null
  }
  const label = (id: string) => {
    const b = byId.get(id)
    return b ? (b.source === 'instagram' ? `@${b.owner}` : b.board ?? b.owner) : ''
  }
  const hovered = hover ? byId.get(hover.id) : undefined
  const missing = pts && data ? blocks.length - pts.ids.length : 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-base font-semibold">Carte</h1>
        <span className="lib-count">
          {status === 'ready' && pts ? `${pts.ids.length.toLocaleString('fr-FR')} images${missing > 0 ? ` · ${missing.toLocaleString('fr-FR')} pas encore analysées par l'IA` : ''}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={fitAll} disabled={status !== 'ready'}><Expand size={15} /> Tout voir</button>
          <button className="btn" onClick={() => void compute()} disabled={status === 'computing' || status === 'loading'} title="Replacer toutes les images (utile après de nombreux ajouts)"><RefreshCw size={15} /> Recalculer</button>
        </div>
      </div>

      <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--bg)' }}>
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full"
          style={{ cursor: dragRef.current ? 'grabbing' : hover ? 'pointer' : 'grab', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onPointerLeave={() => {
            if (!dragRef.current) {
              hoverRef.current = null
              dirty.current = true
              setHover(null)
            }
          }}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--fg-muted)' }}>Ouverture de la carte (première fois : quelques secondes)…</div>
        )}

        {status === 'computing' && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="w-full max-w-md text-center">
              <MapIcon size={36} className="mx-auto mb-3" style={{ color: 'var(--fg-muted)' }} />
              <div className="text-lg font-semibold">Je place tes images sur la carte</div>
              <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>Les images qui se ressemblent vont se retrouver côte à côte. Ça prend une minute environ, une seule fois.</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(progress.fraction * 100)}%`, background: 'var(--accent)', transition: 'width .2s' }} />
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>{progress.phase}…</div>
            </div>
          </div>
        )}

        {status === 'noai' && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <MapIcon size={36} className="mx-auto mb-3" style={{ color: 'var(--fg-muted)' }} />
              <div className="text-lg font-semibold">La carte a besoin de l'analyse des images</div>
              <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>Dans Réglages &gt; Bibliothèque, lance l'analyse par l'IA : elle permet de savoir quelles images se ressemblent. Reviens ensuite ici.</p>
              <button className="btn mt-4" onClick={() => void compute()}><RefreshCw size={15} /> Réessayer</button>
            </div>
          </div>
        )}

        {hovered && hover && !dragRef.current && (
          <div className="pointer-events-none absolute rounded-lg px-3 py-1.5 text-xs shadow-lg" style={{ left: Math.min(hover.x + 16, sizeRef.current.w - 220), top: hover.y + 16, background: 'var(--fg)', color: 'var(--bg)' }}>
            <div className="font-semibold">{label(hover.id)}</div>
            <div className="opacity-80">clic : ce qu'il y a autour · double-clic : ouvrir</div>
          </div>
        )}

        {status === 'ready' && !focus && (
          <div className="lib-hint pointer-events-none absolute left-3 top-3 max-w-sm rounded-xl px-3 py-2" style={{ background: 'var(--bg)', color: 'var(--fg-muted)', border: '1px solid var(--border)' }}>
            Les images proches se ressemblent. Molette : zoomer · glisser : se déplacer · clic sur une image : voir ce qu'il y a autour.
          </div>
        )}

        {focus && focusBlock && (
          <div className="absolute right-3 top-3 flex w-[300px] flex-col overflow-hidden rounded-xl border shadow-lg" style={{ background: 'var(--bg)', borderColor: 'var(--border)', bottom: 12 }}>
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0 flex-1 truncate text-sm font-semibold">{label(focus)}</div>
              <button className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={() => { setFocus(null); setAround([]) }} aria-label="Fermer"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {thumbOf(focus) && <img src={thumbOf(focus)!} alt="" className="mx-auto max-h-56 rounded-md object-contain" />}
              <div className="mt-3 flex gap-2">
                <button className="btn flex-1" onClick={() => useGrid.getState().open(focus)}><ExternalLink size={15} /> Ouvrir</button>
                <button className="btn flex-1" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left - 230, y: r.bottom + 6, ids: [focus] }) }}>Ajouter à…</button>
              </div>
              {/* Les quatre façons de continuer le voyage : de simples icônes ; le nom s'affiche au survol. */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {(Object.keys(STEP_LABELS) as StepKind[]).map((k) => {
                  const StepIcon = STEP_ICONS[k]
                  return (
                    <button key={k} className="btn justify-center" title={STEP_LABELS[k]} aria-label={STEP_LABELS[k]} onClick={() => void step(k)}>
                      <StepIcon size={18} />
                    </button>
                  )
                })}
              </div>
              <div className="mb-1.5 mt-4 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>Autour de celle-ci</div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {around.map((id) => (
                  <div
                    key={id}
                    className="group relative aspect-square cursor-pointer overflow-hidden rounded-md"
                    style={{ background: 'var(--bg-hover)' }}
                    onMouseEnter={() => { hoverRef.current = id; dirty.current = true }}
                    onMouseLeave={() => { hoverRef.current = null; dirty.current = true }}
                    onClick={() => focusOn(id)}
                    onDoubleClick={() => useGrid.getState().open(id)}
                  >
                    {thumbOf(id) && <img src={thumbOf(id)!} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {menu && <BlockMenu x={menu.x} y={menu.y} blockIds={menu.ids} onClose={() => setMenu(null)} />}
    </div>
  )
}
