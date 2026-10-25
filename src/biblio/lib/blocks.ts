// Lecture des blocs pour la grille et la vue détail.

import { getDb } from './db.ts'
import { loadOcrTexts } from './ocr.ts'
import type { BlockKind, FileKind, Source } from './scan.ts'
import { normalize } from './text.ts'

export interface GridBlock {
  id: string
  source: Source
  owner: string
  board: string | null
  originUrl: string
  kind: BlockKind
  publishedAt: string | null
  /** Tous les fichiers du bloc ont disparu du disque. */
  missing: boolean
  /** Chemin relatif du premier fichier (celui qu'on voit dans la grille). */
  rel: string
  firstKind: FileKind
  thumb: string | null
  /** Largeur / hauteur ; 1 tant que la miniature n'est pas faite. */
  ratio: number
  duration: number | null
  count: number
  /** Auteur et tableau sans accents ni majuscules, pour la recherche. */
  search: string
}

export interface BlockFileInfo {
  rel: string
  kind: FileKind
  width: number | null
  height: number | null
  duration: number | null
  thumb: string | null
  missing: boolean
}

interface Row {
  id: string
  source: Source
  owner: string
  board: string | null
  origin_url: string
  kind: BlockKind
  published_at: string | null
  status: string
  rel: string
  first_kind: FileKind
  thumb: string | null
  thumb_ok: number
  width: number | null
  height: number | null
  duration: number | null
  n: number
}

/** Instagram d'abord, du plus récent au plus ancien ; Pinterest (sans date de publication) ensuite, par date d'import. */
const BLOCKS_SQL = `
SELECT b.id, b.source, b.owner, b.board, b.origin_url, b.kind, b.published_at, b.status,
       f.path_rel AS rel, f.kind AS first_kind, f.thumb, f.thumb_ok, f.width, f.height, f.duration,
       (SELECT COUNT(*) FROM lib_files x WHERE x.block_id = b.id) AS n
FROM lib_blocks b
JOIN lib_files f ON f.block_id = b.id AND f.position = (SELECT MIN(position) FROM lib_files WHERE block_id = b.id)
WHERE b.trashed_at IS NULL
ORDER BY (b.published_at IS NULL), b.published_at DESC, b.imported_at DESC, b.id`

export async function loadBlocks(): Promise<GridBlock[]> {
  const d = await getDb()
  const [rows, ocr] = await Promise.all([d.select<Row[]>(BLOCKS_SQL), loadOcrTexts().catch(() => new Map<string, string>())])
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    owner: r.owner,
    board: r.board,
    originUrl: r.origin_url,
    kind: r.kind,
    publishedAt: r.published_at,
    missing: r.status === 'missing',
    rel: r.rel,
    firstKind: r.first_kind,
    thumb: r.thumb_ok === 1 ? r.thumb : null,
    ratio: r.width && r.height ? r.width / r.height : 1,
    duration: r.duration,
    count: r.n,
    // l'auteur, le tableau, et le texte lu dans les vidéos
    search: normalize(`${r.owner} ${r.board ?? ''} ${ocr.get(r.id) ?? ''}`),
  }))
}

export async function loadBlockFiles(blockId: string): Promise<BlockFileInfo[]> {
  const d = await getDb()
  const rows = await d.select<{ rel: string; kind: FileKind; width: number | null; height: number | null; duration: number | null; thumb: string | null; thumb_ok: number; missing: number }[]>(
    'SELECT path_rel AS rel, kind, width, height, duration, thumb, thumb_ok, missing FROM lib_files WHERE block_id = $1 ORDER BY position',
    [blockId],
  )
  return rows.map((r) => ({ rel: r.rel, kind: r.kind, width: r.width, height: r.height, duration: r.duration, thumb: r.thumb_ok === 1 ? r.thumb : null, missing: r.missing === 1 }))
}
