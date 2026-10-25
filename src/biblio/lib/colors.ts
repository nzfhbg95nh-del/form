// Couleurs dominantes des images (calculées en arrière-plan par le programme, à partir des miniatures).
// Ici : lecture, comparaison à une couleur choisie (écart perceptuel en espace Lab), base de données et commandes.

import { invoke } from '@tauri-apps/api/core'
import { getDb, multiInsert } from './db.ts'

export type Lab = [number, number, number]

export interface Swatch {
  /** « rrggbb », sans le dièse. */
  hex: string
  /** Part de l'image, en %. */
  pct: number
  lab: Lab
}

/** Les teintes proposées dans le filtre de couleur. */
export const PALETTE: { hex: string; label: string }[] = [
  { hex: 'e03131', label: 'Rouge' },
  { hex: 'f76707', label: 'Orange' },
  { hex: 'fcc419', label: 'Jaune' },
  { hex: '94d82d', label: 'Vert clair' },
  { hex: '2f9e44', label: 'Vert' },
  { hex: '12b8aa', label: 'Turquoise' },
  { hex: '4dabf7', label: 'Bleu clair' },
  { hex: '1c4fd8', label: 'Bleu' },
  { hex: '7048e8', label: 'Violet' },
  { hex: 'e64980', label: 'Rose' },
  { hex: '8d5a36', label: 'Marron' },
  { hex: '868e96', label: 'Gris' },
]

/** Écart de couleur (ΔE) en dessous duquel une image « a » la couleur cherchée. */
export const COLOR_TOLERANCE = 24
/** Une couleur qui couvre moins de cette part de l'image ne compte pas pour la recherche. */
export const COLOR_MIN_PCT = 8

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)

export function hexToLab(hex: string): Lab {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = linear(((n >> 16) & 255) / 255)
  const g = linear(((n >> 8) & 255) / 255)
  const b = linear((n & 255) / 255)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** Teinte (0–360), saturation et luminosité (0–1) → « rrggbb ». */
export function hsvToHex(h: number, s: number, v: number): string {
  const k = (n: number) => (n + h / 60) % 6
  const ch = (n: number) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1))
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return to(ch(5)) + to(ch(3)) + to(ch(1))
}

/** « rrggbb » → teinte (0–360), saturation et luminosité (0–1). */
export function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return [h * 60, max === 0 ? 0 : d / max, max]
}

export const deltaE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** « ff0010:60,010203:7 » → les couleurs. Une chaîne vide ou abîmée donne une liste vide. */
export function parseColors(text: string): Swatch[] {
  const out: Swatch[] = []
  for (const part of text.split(',')) {
    const m = /^([0-9a-f]{6}):(\d{1,3})$/i.exec(part.trim())
    if (m) out.push({ hex: m[1].toLowerCase(), pct: Number(m[2]), lab: hexToLab(m[1]) })
  }
  return out
}

/** Les couleurs qui comptent d'une image : les 3 plus présentes, d'au moins `minPct` % de l'image. */
const mainColors = (swatches: readonly Swatch[], minPct = COLOR_MIN_PCT) => [...swatches].filter((s) => s.pct >= minPct).sort((x, y) => y.pct - x.pct).slice(0, 3)

/**
 * À quel point deux images ont des couleurs différentes (0 = mêmes couleurs). Pour chaque couleur importante d'une image, on prend
 * l'écart (ΔE) avec la couleur la plus proche de l'autre image, pondéré par sa part ; on fait la moyenne dans les deux sens.
 * Infini si l'une des deux n'a aucune couleur retenue (image presque blanche ou noire).
 */
export function paletteDistance(a: readonly Swatch[], b: readonly Swatch[]): number {
  const ma = mainColors(a)
  const mb = mainColors(b)
  if (ma.length === 0 || mb.length === 0) return Infinity
  const oneWay = (from: Swatch[], to: Swatch[]) => {
    const total = from.reduce((n, s) => n + s.pct, 0)
    return from.reduce((n, s) => n + s.pct * Math.min(...to.map((t) => deltaE(s.lab, t.lab))), 0) / total
  }
  return (oneWay(ma, mb) + oneWay(mb, ma)) / 2
}

/** Une des couleurs (assez présente) est-elle proche de la couleur cherchée ? */
export function hasColor(swatches: readonly Swatch[], target: Lab, tolerance = COLOR_TOLERANCE, minPct = COLOR_MIN_PCT): boolean {
  return swatches.some((s) => s.pct >= minPct && deltaE(s.lab, target) <= tolerance)
}

/** Bloc → ses couleurs (celles de toutes ses images, les plus présentes d'abord). */
export type ColorIndex = ReadonlyMap<string, Swatch[]>

export async function loadColorIndex(): Promise<ColorIndex> {
  const d = await getDb()
  const rows = await d.select<{ block: string; colors: string }[]>(
    "SELECT f.block_id AS block, c.colors FROM lib_colors c JOIN lib_files f ON f.path_rel = c.path_rel WHERE c.colors <> ''",
  )
  const index = new Map<string, Swatch[]>()
  for (const r of rows) {
    const list = index.get(r.block) ?? []
    list.push(...parseColors(r.colors))
    index.set(r.block, list)
  }
  return index
}

export async function loadFileColors(rel: string): Promise<Swatch[]> {
  const d = await getDb()
  const rows = await d.select<{ colors: string }[]>('SELECT colors FROM lib_colors WHERE path_rel = $1', [rel])
  return rows.length > 0 ? parseColors(rows[0].colors) : []
}

export interface ColorResult {
  rel: string
  colors: string
}

export async function colorCounts(): Promise<{ done: number; pending: number }> {
  const d = await getDb()
  const [row] = await d.select<{ done: number; pending: number }[]>(
    `SELECT
       (SELECT COUNT(*) FROM lib_colors) AS done,
       (SELECT COUNT(*) FROM lib_files f WHERE f.thumb_ok = 1 AND f.missing = 0 AND NOT EXISTS (SELECT 1 FROM lib_colors c WHERE c.path_rel = f.path_rel)) AS pending`,
  )
  return row
}

/** Lance le calcul pour les miniatures prêtes qui n'ont pas encore leurs couleurs. `false` s'il n'y a rien à faire ou si un calcul tourne déjà. */
export async function startColors(): Promise<boolean> {
  const d = await getDb()
  const jobs = await d.select<{ rel: string; thumb: string }[]>(
    `SELECT f.path_rel AS rel, f.thumb FROM lib_files f
     WHERE f.thumb_ok = 1 AND f.missing = 0 AND f.thumb IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lib_colors c WHERE c.path_rel = f.path_rel)`,
  )
  if (jobs.length === 0) return false
  return invoke<boolean>('colors_start', { jobs })
}

export async function saveColors(results: ColorResult[]) {
  if (results.length === 0) return
  const now = new Date().toISOString()
  await multiInsert('lib_colors', ['path_rel', 'colors', 'created_at'], results.map((r) => [r.rel, r.colors, now]), { verb: 'INSERT OR REPLACE' })
}
