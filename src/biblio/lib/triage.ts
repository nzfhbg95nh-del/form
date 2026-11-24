// Tri rapide des nouveautés : après un téléchargement Instagram / Pinterest, Victor passe en revue ce qui est arrivé
// (un carrousel entier d'un coup) et enlève les images qu'il ne voulait pas. Rien n'est touché avant « Terminer le tri » ;
// les images enlevées vont dans la corbeille de Form (récupérables) et ne reviennent pas au téléchargement suivant.

import { getDb } from './db.ts'
import { getSetting, setSetting } from './library.ts'
import type { FileKind } from './scan.ts'

/** Réglage : la date du dernier tri. Ce qui est arrivé après est « à trier ». */
export const TRIAGE_SINCE_KEY = 'triage_since'

export interface TriageFile { rel: string; kind: FileKind; thumb: string | null }
export interface TriagePost { blockId: string; source: string; owner: string; board: string | null; originUrl: string | null; files: TriageFile[] }

export interface TriageRow { blockId: string; source: string; owner: string; board: string | null; originUrl: string | null; rel: string; kind: FileKind; thumb: string | null }

/** Les lignes de la base (une par fichier, dans l'ordre) → un post par bloc, ses images dans l'ordre du carrousel. */
export function groupPosts(rows: TriageRow[]): TriagePost[] {
  const posts = new Map<string, TriagePost>()
  for (const r of rows) {
    let p = posts.get(r.blockId)
    if (!p) {
      p = { blockId: r.blockId, source: r.source, owner: r.owner, board: r.board, originUrl: r.originUrl, files: [] }
      posts.set(r.blockId, p)
    }
    p.files.push({ rel: r.rel, kind: r.kind, thumb: r.thumb })
  }
  return [...posts.values()]
}

/**
 * Ce qui part à la corbeille : un post dont toutes les images sont enlevées part en entier (le bloc) ;
 * sinon seules les images enlevées partent, le reste du carrousel reste.
 */
export function triagePlan(posts: TriagePost[], removed: ReadonlySet<string>): { blocks: string[]; files: string[] } {
  const blocks: string[] = []
  const files: string[] = []
  for (const p of posts) {
    const gone = p.files.filter((f) => removed.has(f.rel))
    if (gone.length === 0) continue
    if (gone.length === p.files.length) blocks.push(p.blockId)
    else files.push(...gone.map((f) => f.rel))
  }
  return { blocks, files }
}

/** La date du dernier tri. La toute première fois, on part de maintenant : la bibliothèque existante n'est pas « à trier ». */
export async function triageSince(): Promise<string> {
  const saved = await getSetting(TRIAGE_SINCE_KEY)
  if (saved) return saved
  const now = new Date().toISOString()
  await setSetting(TRIAGE_SINCE_KEY, now)
  return now
}

export const markTriaged = (at: string = new Date().toISOString()) => setSetting(TRIAGE_SINCE_KEY, at)

const NEW_WHERE = `b.source IN ('instagram', 'pinterest') AND b.trashed_at IS NULL AND b.imported_at > $1 AND f.missing = 0`

/** Combien d'images attendent d'être triées. */
export async function triageCount(): Promise<number> {
  const since = await triageSince()
  const d = await getDb()
  const [row] = await d.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM lib_files f JOIN lib_blocks b ON b.id = f.block_id WHERE ${NEW_WHERE}`, [since])
  return row?.n ?? 0
}

/** Les posts à trier, du plus ancien arrivé au plus récent. */
export async function loadTriage(): Promise<TriagePost[]> {
  const since = await triageSince()
  const d = await getDb()
  const rows = await d.select<TriageRow[]>(
    `SELECT b.id AS blockId, b.source AS source, b.owner AS owner, b.board AS board, b.origin_url AS originUrl,
            f.path_rel AS rel, f.kind AS kind, CASE WHEN f.thumb_ok = 1 THEN f.thumb ELSE NULL END AS thumb
       FROM lib_files f JOIN lib_blocks b ON b.id = f.block_id
      WHERE ${NEW_WHERE}
      ORDER BY b.imported_at, b.source, b.owner, b.id, f.position`,
    [since],
  )
  return groupPosts(rows)
}
