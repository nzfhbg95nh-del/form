// Le moteur de dessin vectoriel de Form : les outils (plume, flèche blanche, crayon…) sont ceux de VectorCraft (MIT ou Apache-2.0),
// qui tournent côté Rust (`src-tauri/src/vector.rs`). Ici : le pont. Form envoie les tracés du moodboard et les gestes de la souris,
// le moteur répond avec les tracés modifiés, les dessins à poser par-dessus (points, poignées, repères) et la forme du curseur.

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './repo'
import type { BoardItem } from './moodboard'
import { worldPoints, rebuildPathItem } from './boardPathEdit'
import { penToItem } from './boardPath'
import type { PenPoint } from './boardPath'
import type { ShapeStyle } from './boardShapes'

/** Les outils de Form qui sont des outils du moteur : leur identifiant côté VectorCraft. */
export const ENGINE_TOOLS = {
  direct: 'directSelection',
  pen: 'pen',
  addAnchor: 'addAnchor',
  deleteAnchor: 'deleteAnchor',
  convert: 'anchorPoint',
  pencil: 'pencil',
  smooth: 'smooth',
  eraser: 'pathEraser',
  join: 'join',
} as const

export type EngineTool = keyof typeof ENGINE_TOOLS
export const isEngineTool = (tool: string): tool is EngineTool => tool in ENGINE_TOOLS

export interface VcPoint { x: number; y: number; ix: number; iy: number; ox: number; oy: number }
export interface VcPath { id: string; closed: boolean; points: VcPoint[] }
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

/** Un élément « tracé » du moodboard, au format du moteur (points sur la toile, poignées en écarts). */
export const isPathItem = (i: BoardItem) => i.kind === 'shape' && i.shape === 'path' && !!i.path
export function itemToVcPath(it: BoardItem): VcPath {
  return { id: it.id, closed: !!it.closed, points: worldPoints(it).map((p) => ({ x: p.x, y: p.y, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })) }
}

const toPen = (p: VcPoint): PenPoint => ({ x: p.x, y: p.y, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })

/**
 * Les éléments du moodboard une fois les tracés du moteur appliqués : les tracés connus sont mis à jour, ceux que le moteur a supprimés
 * disparaissent, ceux qu'il a créés (identifiants « vc… ») deviennent de nouveaux éléments dans le style donné. Les autres éléments ne bougent pas.
 */
export function applyVcPaths(items: BoardItem[], paths: VcPath[], style: ShapeStyle): BoardItem[] {
  const byId = new Map(paths.map((p) => [p.id, p]))
  const out: BoardItem[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (!isPathItem(it)) { out.push(it); continue }
    const p = byId.get(it.id)
    if (!p) continue
    seen.add(it.id)
    out.push(samePath(it, p) ? it : rebuildPathItem(it, p.points.map(toPen), p.closed))
  }
  for (const p of paths) {
    if (seen.has(p.id)) continue
    // Un tracé fait par un outil : il prend le style de la plume ; un 2e morceau d'un tracé coupé garde le style de son tracé d'origine.
    const origin = items.find((i) => isPathItem(i) && p.id.startsWith(i.id + '#'))
    const made = origin ? rebuildPathItem({ ...origin, id: p.id }, p.points.map(toPen), p.closed) : { ...penToItem(p.points.map(toPen), p.closed, style), id: p.id }
    out.push(made)
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

  load(paths: VcPath[], selected: string[], tool: EngineTool, zoom: number): Promise<VcOut> {
    this.loaded = true
    return this.enqueue(() => invoke<VcOut>('vc_load', { paths, selected, tool: ENGINE_TOOLS[tool], zoom }))
  }

  setTool(tool: EngineTool, zoom: number): Promise<VcOut> {
    return this.enqueue(() => invoke<VcOut>('vc_tool', { tool: ENGINE_TOOLS[tool], zoom }))
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
