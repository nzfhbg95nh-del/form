// Le moteur de dessin vectoriel de Form : les outils (plume, flèche blanche, crayon, formes, gommes, ciseaux…) sont ceux de VectorCraft
// (MIT ou Apache-2.0), qui tournent côté Rust (`src-tauri/src/vector.rs`). Ici : le pont. Form envoie les tracés du moodboard et les gestes
// de la souris, le moteur répond avec les tracés modifiés, les dessins à poser par-dessus (points, poignées, repères) et la forme du curseur.

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './repo'
import type { BoardItem } from './moodboard'
import { worldPoints, rebuildPathItem } from './boardPathEdit'
import { penToItem, type PenPoint } from './boardPath'

/** Les outils qui restent ceux de Form (les autres sont ceux du moteur, qui les connaît par le même nom). */
export const OUR_TOOLS = ['select', 'hand', 'text'] as const
export const isEngineTool = (tool: string) => !(OUR_TOOLS as readonly string[]).includes(tool)

export interface VcPoint { x: number; y: number; ix: number; iy: number; ox: number; oy: number }
/** Remplissage, contour (couleurs #rrggbb, ou rien) et épaisseur du contour. */
export interface PaintStyle { fill: string | null; stroke: string | null; sw: number }
export interface VcPath { id: string; closed: boolean; points: VcPoint[]; fill: string | null; stroke: string | null; sw: number }
type Pt = [number, number]
export type VcOverlay =
  | { t: 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'path'; d: string; color: number[]; width: number; dashed: boolean }
  | { t: 'line'; a: Pt; b: Pt; color: number[]; dashed: boolean }
  | { t: 'anchor'; p: Pt; color: number[]; filled: boolean; size: number }
  | { t: 'curvePoint'; p: Pt; color: number[]; filled: boolean; size: number }
  | { t: 'handle'; p: Pt; color: number[] }
  | { t: 'label'; p: Pt; text: string; color: number[] }
  | { t: 'measure'; p: Pt; text: string }
  | { t: 'distance'; a: Pt; b: Pt; text: string; color: number[] }
  | { t: 'highlight'; quad: Pt[]; color: number[] }
  | { t: 'swatch'; p: Pt; color: number[]; selected: boolean }
  | { t: 'gridLine'; a: Pt; b: Pt; color: number[] }
  | { t: 'none' }

export interface VcOut {
  paths: VcPath[]
  selected: string[]
  overlays: VcOverlay[]
  cursor: string
  tool: string
  switch_tool: string | null
  status: string | null
  busy: boolean
}

export interface VcMods { shift: boolean; alt: boolean; ctrl: boolean; space: boolean }
export type VcKind = 'down' | 'move' | 'drag' | 'up' | 'double'

export const DEFAULT_PAINT: PaintStyle = { fill: null, stroke: '#111111', sw: 2 }

/** Un élément « tracé » du moodboard, au format du moteur (points sur la toile, poignées en écarts) avec son style. */
export const isPathItem = (i: BoardItem) => i.kind === 'shape' && i.shape === 'path' && !!i.path

/** Le remplissage d'un élément : sa couleur, ou rien. */
export const fillOf = (it: BoardItem): string | null => (it.fill !== undefined ? (it.fill === 'none' ? null : it.fill) : it.filled ? it.color ?? null : null)
/** Le contour d'un élément : sa couleur et son épaisseur (rien si l'épaisseur est nulle). */
export const strokeOf = (it: BoardItem): { color: string | null; sw: number } => {
  const sw = it.sw ?? DEFAULT_PAINT.sw
  return { color: sw > 0 ? it.color ?? DEFAULT_PAINT.stroke : null, sw }
}

export function itemToVcPath(it: BoardItem): VcPath {
  const { color, sw } = strokeOf(it)
  return { id: it.id, closed: !!it.closed, fill: fillOf(it), stroke: color, sw, points: worldPoints(it).map((p) => ({ x: p.x, y: p.y, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })) }
}

const toPen = (p: { x: number; y: number; ix: number; iy: number; ox: number; oy: number }): PenPoint => ({ x: p.x, y: p.y, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })

/** Le style du moteur reporté sur l'élément (sans contour : épaisseur 0, la couleur du contour est gardée pour le retrouver). */
const withStyle = (it: BoardItem, p: VcPath): BoardItem => {
  const next: BoardItem = { ...it, fill: p.fill ?? 'none', sw: p.stroke ? p.sw : 0, color: p.stroke ?? it.color, filled: undefined }
  return next
}

/**
 * Les éléments du moodboard une fois les tracés du moteur appliqués : les tracés connus sont mis à jour (forme et style), ceux que le moteur
 * a supprimés disparaissent, ceux qu'il a créés (identifiants « vc… ») deviennent de nouveaux éléments. Les autres éléments ne bougent pas.
 */
export function applyVcPaths(items: BoardItem[], paths: VcPath[]): BoardItem[] {
  const byId = new Map(paths.map((p) => [p.id, p]))
  const out: BoardItem[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (!isPathItem(it)) { out.push(it); continue }
    const p = byId.get(it.id)
    if (!p) continue
    seen.add(it.id)
    const same = samePath(it, p)
    out.push(same && sameStyle(it, p) ? it : withStyle(same ? it : rebuildPathItem(it, p.points.map(toPen), p.closed), p))
  }
  for (const p of paths) {
    if (seen.has(p.id)) continue
    const base = { ...penToItem(p.points.map(toPen), p.closed, { shape: 'path', color: '#111111', fill: 'none', sw: 2, dash: 'solid', opacity: 1, radius: 0, sides: 0, points: 0, inner: 0 }), id: p.id }
    out.push(withStyle(base, p))
  }
  return out
}

/** Le tracé du moteur est-il déjà celui de l'élément (à une fraction de point près) ? */
function samePath(it: BoardItem, p: VcPath): boolean {
  const now = worldPoints(it)
  if (now.length !== p.points.length || !!it.closed !== p.closed) return false
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005
  return now.every((q, i) => {
    const r = p.points[i]
    return near(q.x, r.x) && near(q.y, r.y) && near(q.ix, r.ix) && near(q.iy, r.iy) && near(q.ox, r.ox) && near(q.oy, r.oy)
  })
}

function sameStyle(it: BoardItem, p: VcPath): boolean {
  const { color, sw } = strokeOf(it)
  return fillOf(it) === p.fill && color === p.stroke && Math.abs(sw - (p.stroke ? p.sw : sw)) < 0.005
}

/**
 * La conversation avec le moteur : les envois partent dans l'ordre, et pendant qu'un envoi attend sa réponse, les déplacements de la souris
 * qui s'accumulent sont réduits au dernier (les appuis et relâchements, eux, ne sont jamais perdus).
 */
export class VectorSession {
  private chain: Promise<unknown> = Promise.resolve()
  private pendingMove: { kind: VcKind; x: number; y: number; mods: VcMods; zoom: number; resolve: (o: VcOut | null) => void } | null = null
  loaded = false

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job)
    this.chain = run.catch(() => undefined)
    return run
  }

  load(paths: VcPath[], selected: string[], tool: string, zoom: number, defaults: PaintStyle): Promise<VcOut> {
    this.loaded = true
    return this.enqueue(() => invoke<VcOut>('vc_load', { paths, selected, tool, zoom, defaults }))
  }

  setTool(tool: string, zoom: number): Promise<VcOut> {
    return this.enqueue(() => invoke<VcOut>('vc_tool', { tool, zoom }))
  }

  /** Change le remplissage et le contour des objets choisis et des prochains objets. */
  paint(style: PaintStyle, zoom: number): Promise<VcOut> {
    return this.enqueue(() => invoke<VcOut>('vc_paint', { style, zoom }))
  }

  pointer(kind: VcKind, x: number, y: number, mods: VcMods, zoom: number): Promise<VcOut | null> {
    if (kind === 'move' || kind === 'drag') {
      // Un seul déplacement en attente à la fois : le plus récent remplace les précédents.
      if (this.pendingMove) {
        const old = this.pendingMove
        this.pendingMove = { kind, x, y, mods, zoom, resolve: old.resolve }
        return new Promise((resolve) => { old.resolve = (o) => resolve(o) }) as Promise<VcOut | null>
      }
      return new Promise((resolve) => {
        this.pendingMove = { kind, x, y, mods, zoom, resolve }
        void this.enqueue(async () => {
          const m = this.pendingMove
          this.pendingMove = null
          if (!m) return
          try { m.resolve(await invoke<VcOut>('vc_pointer', { event: { kind: m.kind, x: m.x, y: m.y, mods: m.mods }, zoom: m.zoom })) } catch { m.resolve(null) }
        })
      })
    }
    // Un appui ou un relâchement passe après les déplacements en attente.
    return this.enqueue(() => invoke<VcOut>('vc_pointer', { event: { kind, x, y, mods }, zoom }))
  }

  key(key: string, mods: VcMods, zoom: number): Promise<VcOut> {
    return this.enqueue(() => invoke<VcOut>('vc_key', { key, mods, zoom }))
  }

  close(): Promise<void> {
    this.loaded = false
    return this.enqueue(() => invoke<void>('vc_close')).catch(() => undefined)
  }
}

export const engineAvailable = () => isTauri()
