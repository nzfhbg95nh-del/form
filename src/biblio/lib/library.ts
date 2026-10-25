// Bibliothèque : synchronisation du dossier de Social Saver avec la base de Klippr.
// Les fichiers ne sont jamais copiés ni modifiés : la base ne garde que leurs chemins et ce qu'on en déduit.

import { invoke } from '@tauri-apps/api/core'
import { getDb, inChunks, multiInsert } from './db.ts'
import { loadForgotten } from './trash.ts'
import { buildBlocks, diffFiles, type ScannedFile, dropForgotten } from './scan.ts'

export const DEFAULT_ROOT = 'C:\\Users\\noesa\\Desktop\\Social Saver\\Save images'

export interface LibraryStats {
  blocks: number
  files: number
  collections: number
  missing: number
  thumbsReady: number
  thumbsPending: number
  thumbsFailed: number
}

export interface SyncResult {
  scanned: number
  added: number
  missing: number
  restored: number
}

export async function getSetting(key: string): Promise<string | null> {
  const d = await getDb()
  const rows = await d.select<{ value: string }[]>('SELECT value FROM settings WHERE key = $1', [key])
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string) {
  const d = await getDb()
  await d.execute('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
}

const BLOCK_COLUMNS = ['id', 'source', 'owner', 'board', 'origin_id', 'origin_url', 'kind', 'published_at', 'imported_at'] as const
const FILE_COLUMNS = ['path_rel', 'block_id', 'position', 'kind', 'size', 'mtime'] as const

/** Lit le dossier, puis ajoute à la base ce qui est nouveau et marque « introuvable » ce qui a disparu. */
export async function syncLibrary(root: string, onProgress?: (label: string, done: number, total: number) => void): Promise<SyncResult> {
  onProgress?.('Lecture du dossier…', 0, 0)
  const scanned = await invoke<ScannedFile[]>('scan_folder', { root })
  const d = await getDb()
  const known = await d.select<{ rel: string; missing: number }[]>('SELECT path_rel AS rel, missing FROM lib_files')
  const diff = diffFiles(scanned, known)

  if (diff.added.length > 0) {
    const now = new Date().toISOString()
    const { blocks: allBlocks, collections } = buildBlocks(scanned)
    // Ce que Victor a supprimé définitivement ne revient pas, même si Social Saver remet le fichier.
    const blocks = dropForgotten(allBlocks, await loadForgotten())
    const addedSet = new Set(diff.added.map((f) => f.rel))
    // Les blocs touchés par un nouveau fichier : on les (re)écrit en entier, ce qui rattache aussi un carrousel qui s'agrandit.
    const touched = blocks.filter((b) => b.files.some((f) => addedSet.has(f.rel)))
    const touchedCollections = new Set(touched.flatMap((b) => b.collectionIds))

    await multiInsert(
      'lib_collections',
      ['id', 'name', 'kind', 'owner', 'created_at'],
      collections.filter((c) => touchedCollections.has(c.id)).map((c) => [c.id, c.name, c.kind, c.owner, now]),
      { verb: 'INSERT OR IGNORE' },
    )
    const total = touched.length + diff.added.length
    await multiInsert(
      'lib_blocks',
      BLOCK_COLUMNS,
      touched.map((b) => [b.id, b.source, b.owner, b.board, b.originId, b.originUrl, b.kind, b.publishedAt, now]),
      { suffix: "ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, status = 'ok'" },
      (n) => onProgress?.('Enregistrement des blocs…', n, total),
    )
    const fileRows = touched.flatMap((b) => b.files.filter((f) => addedSet.has(f.rel)).map((f) => [f.rel, b.id, f.position, f.kind, f.size, f.mtime]))
    await multiInsert('lib_files', FILE_COLUMNS, fileRows, {}, (n) => onProgress?.('Enregistrement des fichiers…', touched.length + n, total))
    await multiInsert(
      'lib_block_collections',
      ['block_id', 'collection_id'],
      touched.flatMap((b) => b.collectionIds.map((c) => [b.id, c])),
      { verb: 'INSERT OR IGNORE' },
    )
  }

  if (diff.missing.length > 0) {
    await inChunks(diff.missing, (marks, chunk) => d.execute(`UPDATE lib_files SET missing = 1 WHERE path_rel IN (${marks})`, chunk))
  }
  if (diff.restored.length > 0) {
    await inChunks(diff.restored, (marks, chunk) => d.execute(`UPDATE lib_files SET missing = 0 WHERE path_rel IN (${marks})`, chunk))
  }
  if (diff.missing.length > 0 || diff.restored.length > 0) {
    await d.execute(
      `UPDATE lib_blocks SET status = CASE WHEN EXISTS (SELECT 1 FROM lib_files f WHERE f.block_id = lib_blocks.id AND f.missing = 0) THEN 'ok' ELSE 'missing' END`,
    )
  }
  return { scanned: scanned.length, added: diff.added.length, missing: diff.missing.length, restored: diff.restored.length }
}

export async function getStats(): Promise<LibraryStats> {
  const d = await getDb()
  const [row] = await d.select<LibraryStats[]>(
    `SELECT
       (SELECT COUNT(*) FROM lib_blocks WHERE trashed_at IS NULL) AS blocks,
       (SELECT COUNT(*) FROM lib_files) AS files,
       (SELECT COUNT(*) FROM lib_collections) AS collections,
       (SELECT COUNT(*) FROM lib_files WHERE missing = 1) AS missing,
       (SELECT COUNT(*) FROM lib_files WHERE thumb_ok = 1 AND missing = 0) AS thumbsReady,
       (SELECT COUNT(*) FROM lib_files WHERE thumb_ok = 0 AND missing = 0) AS thumbsPending,
       (SELECT COUNT(*) FROM lib_files WHERE thumb_ok = -1 AND missing = 0) AS thumbsFailed`,
  )
  return row
}

interface ThumbResult {
  rel: string
  thumb: string
  w: number
  h: number
  duration: number | null
  ok: boolean
}

/** Lance les miniatures manquantes en arrière-plan (Rust). Rend `false` s'il n'y a rien à faire ou si un lot tourne déjà. */
export async function startThumbs(root: string): Promise<boolean> {
  const d = await getDb()
  // Les plus récents d'abord : ce sont eux qu'on voit en haut de la grille.
  const jobs = await d.select<{ rel: string; kind: string }[]>(
    `SELECT f.path_rel AS rel, f.kind FROM lib_files f JOIN lib_blocks b ON b.id = f.block_id
     WHERE f.thumb_ok = 0 AND f.missing = 0
     ORDER BY (b.published_at IS NULL), b.published_at DESC, f.path_rel`,
  )
  if (jobs.length === 0) return false
  return invoke<boolean>('start_thumbs', { root, jobs })
}

/** Enregistre un lot de miniatures terminées. */
export async function applyThumbBatch(results: ThumbResult[]) {
  if (results.length === 0) return
  const d = await getDb()
  let n = 0
  const values = results.map(() => `($${++n},$${++n}, $${++n}, $${++n}, $${++n}, $${++n})`).join(', ')
  const params = results.flatMap((r) => [r.rel, r.ok ? r.thumb : null, r.ok ? r.w : null, r.ok ? r.h : null, r.duration, r.ok ? 1 : -1])
  await d.execute(
    `WITH v(rel, thumb, w, h, duration, ok) AS (VALUES ${values})
     UPDATE lib_files SET thumb = v.thumb, width = v.w, height = v.h, duration = v.duration, thumb_ok = v.ok
     FROM v WHERE lib_files.path_rel = v.rel`,
    params,
  )
}

export type { ThumbResult }
