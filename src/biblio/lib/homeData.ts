// Ce que les widgets de l'accueil lisent dans la bibliothèque : une image au hasard, les souvenirs du jour, ce qu'il reste à trier.

import { invoke } from '@tauri-apps/api/core'
import { getDb } from './db.ts'
import { countUnsorted } from './collections.ts'
import { fileUrl, thumbPath } from './media.ts'

let thumbsDir = ''
/** L'adresse (utilisable dans <img>) de la miniature d'un fichier. */
export async function thumbUrl(thumb: string | null): Promise<string | null> {
  if (!thumb) return null
  if (!thumbsDir) thumbsDir = await invoke<string>('thumbs_dir')
  return fileUrl(thumbPath(thumbsDir, thumb))
}

export interface HomeBlock {
  id: string
  source: string
  owner: string
  board: string | null
  publishedAt: string | null
  thumb: string | null
  ratio: number
}

interface Row { id: string; source: string; owner: string; board: string | null; published_at: string | null; thumb: string | null; width: number | null; height: number | null }

const toBlock = (r: Row): HomeBlock => ({
  id: r.id, source: r.source, owner: r.owner, board: r.board, publishedAt: r.published_at, thumb: r.thumb,
  ratio: r.width && r.height ? r.width / r.height : 1,
})

const SELECT = `SELECT b.id, b.source, b.owner, b.board, b.published_at, f.thumb, f.width, f.height
  FROM lib_blocks b JOIN lib_files f ON f.block_id = b.id AND f.position = 0`
const READY = `f.thumb_ok = 1 AND f.thumb IS NOT NULL AND f.missing = 0 AND b.trashed_at IS NULL AND b.kind <> 'video'`

/** Une image au hasard (jamais celle qu'on vient de voir, `not`). */
export async function randomBlock(not?: string | null): Promise<HomeBlock | null> {
  const d = await getDb()
  const rows = await d.select<Row[]>(`${SELECT} WHERE ${READY}${not ? ' AND b.id <> $1' : ''} ORDER BY RANDOM() LIMIT 1`, not ? [not] : [])
  return rows[0] ? toBlock(rows[0]) : null
}

/** Les jours (MM-JJ) autour d'aujourd'hui : on cherche les images enregistrées à la même période les années passées. */
export function daysAround(now: Date, spread = 3): string[] {
  const out: string[] = []
  for (let k = -spread; k <= spread; k++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k)
    out.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}

/** Les images enregistrées à cette période les années précédentes (celles qui ont une vraie date : Instagram et les ajouts). */
export async function memories(now: Date = new Date(), limit = 6): Promise<(HomeBlock & { years: number })[]> {
  const days = daysAround(now)
  const d = await getDb()
  const rows = await d.select<Row[]>(
    `${SELECT} WHERE ${READY} AND b.published_at IS NOT NULL AND substr(b.published_at, 6, 5) IN (${days.map((_, i) => `$${i + 1}`).join(',')}) AND CAST(substr(b.published_at, 1, 4) AS INTEGER) < $${days.length + 1}
     ORDER BY b.published_at DESC LIMIT ${limit * 3}`,
    [...days, now.getFullYear()],
  )
  // Une seule image par jour d'origine pour varier.
  const seen = new Set<string>()
  const out: (HomeBlock & { years: number })[] = []
  for (const r of rows) {
    const key = r.published_at!.slice(0, 10) + r.owner
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...toBlock(r), years: now.getFullYear() - Number(r.published_at!.slice(0, 4)) })
    if (out.length >= limit) break
  }
  return out
}

export interface TriageStats { unsorted: number; addedWeek: number }

/** Ce qu'il reste à ranger, et ce que Victor a ajouté à la main depuis une semaine. */
export async function triageStats(): Promise<TriageStats> {
  const d = await getDb()
  const [week] = await d.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM lib_blocks WHERE source = 'manual' AND trashed_at IS NULL AND imported_at >= datetime('now', '-7 days')",
  )
  return { unsorted: await countUnsorted(), addedWeek: week?.n ?? 0 }
}

/** Le nom à afficher sous une image. */
export const blockLabel = (b: Pick<HomeBlock, 'source' | 'owner' | 'board'>) =>
  b.source === 'instagram' ? `@${b.owner}` : b.source === 'manual' ? 'Ajoutée à la main' : b.board ?? b.owner
